import { describe, expect, it, vi } from "vitest";

import { type RunEvent, runEventSchema } from "../../agent/events";
import type { InvestigationOptions } from "../../agent/orchestrator";
import { isRunId } from "../run-id";
import { createDailyLedger } from "./daily-budget";
import { parseServerEnv } from "./env-schema";
import {
  createInvestigateHandler,
  type InvestigateDeps,
  NEBIUS_TIMEOUT_MS,
  TRIAL_MAX_USD,
  TRIAL_RESERVE_USD,
} from "./investigate-handler";
import type { NebiusClient } from "./providers/nebius";
import type { TavilyClient } from "./providers/tavily";
import { createMemoryLimiter, type Limit, type RateLimiter } from "./rate-limit";
import type { RunStore } from "./run-store";

const NEBIUS_KEY = "fake-visitor-nebius-key";
const TAVILY_KEY = "fake-visitor-tavily-key";

const DONE: RunEvent = { type: "done", nebiusUsd: 0.004, tavilyCredits: 5, unknownCostCalls: 0, seconds: 1 };
const STARTED: RunEvent = { type: "started", quote: "q", popularAttribution: "Rumi", language: "en", excludeDomains: [] };
const SEARCHED: RunEvent = { type: "searched", query: "q", results: 3, credits: 1, latencyMs: 5 };

const body = (keys: unknown) => ({ quote: "Gel, gel, ne olursan ol yine gel", popularAttribution: "Rumi", keys });
const byok = body({ mode: "byok", nebiusApiKey: NEBIUS_KEY, tavilyApiKey: TAVILY_KEY });
const trial = body({ mode: "trial" });

const post = (json: unknown, signal?: AbortSignal, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/investigate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(json),
    signal,
  });

// A limiter that remembers who it was asked about, and can be made to fail.
function spyLimiter(answer: (limit: Limit) => Promise<boolean> = async () => true) {
  const hits: { visitor: string; limit: Limit }[] = [];
  const limiter: RateLimiter = {
    hit: async (visitor, limit) => {
      hits.push({ visitor, limit });
      return answer(limit);
    },
    unhit: async () => {},
  };
  return { limiter, hits };
}

type Run = (options: InvestigationOptions) => Promise<void>;

const emitDone: Run = async ({ onEvent }) => {
  onEvent(STARTED);
  onEvent(SEARCHED);
  onEvent(DONE);
};

function setup(overrides: Partial<InvestigateDeps> & { run?: Run; envVars?: Record<string, string> } = {}) {
  const { run = emitDone, envVars = {}, ...rest } = overrides;
  const calls: InvestigationOptions[] = [];
  const createNebius = vi.fn(() => ({}) as NebiusClient);
  const createTavily = vi.fn(() => ({}) as TavilyClient);
  const logError = vi.fn();
  const deps: InvestigateDeps = {
    env: parseServerEnv(envVars),
    ledger: createDailyLedger(0),
    limiter: createMemoryLimiter(),
    excludeDomains: ["quoteinvestigator.com"],
    createNebius,
    createTavily,
    investigate: (options) => {
      calls.push(options);
      return run(options);
    },
    logError,
    ...rest,
  };
  return { handler: createInvestigateHandler(deps), calls, createNebius, createTavily, logError };
}

const ownerEnv = {
  NEBIUS_API_KEY: "owner-nebius",
  TAVILY_API_KEY: "owner-tavily",
  LIVE_RUNS_ENABLED: "true",
  TRIAL_RUNS_ENABLED: "true",
};

// Splits an SSE body into its data payloads and named events.
function frames(text: string) {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const event = /^event: (.+)$/m.exec(frame)?.[1] ?? null;
      const data = /^data: (.+)$/m.exec(frame)?.[1];
      return { event, data: data ? JSON.parse(data) : null, comment: frame.startsWith(":") };
    });
}

describe("POST /api/investigate", () => {
  it("streams every run event as an SSE data line, with streaming headers", async () => {
    const { handler, calls } = setup();
    const res = await handler(post(byok));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const events = frames(await res.text()).map((f) => runEventSchema.parse(f.data));
    expect(events.map((e) => e.type)).toEqual(["started", "searched", "done"]);
    expect(calls[0].input).toMatchObject({ language: "en", excludeDomains: ["quoteinvestigator.com"] });
  });

  it("never falls back to owner keys for a blank BYOK key, and creates no client", async () => {
    const { handler, createNebius, createTavily, calls } = setup({ envVars: ownerEnv });
    const res = await handler(post(body({ mode: "byok", nebiusApiKey: NEBIUS_KEY, tavilyApiKey: " " })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "byok_incomplete" });
    expect(createNebius).not.toHaveBeenCalled();
    expect(createTavily).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("refuses trial runs unless both switches are on", async () => {
    const { handler, calls } = setup({ envVars: { ...ownerEnv, TRIAL_RUNS_ENABLED: "false" } });
    const res = await handler(post(trial));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trial_disabled" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a trial run once the daily budget can't cover it", async () => {
    const { handler, calls } = setup({ envVars: ownerEnv, ledger: createDailyLedger(0) });
    const res = await handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a trial run when the daily budget can't be checked, and logs why", async () => {
    const ledger = { reserve: async () => Promise.reject(new Error("reserve_trial_budget failed with 503")) };
    const { handler, calls, logError } = setup({ envVars: ownerEnv, ledger });
    const res = await handler(post(trial));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "limits_unavailable" });
    expect(calls).toHaveLength(0);
    expect(logError.mock.calls[0][0]).toContain("could not check the daily budget");
  });

  it("still ends the stream when settling fails, and logs it", async () => {
    const ledger = {
      reserve: async () => ({ settle: async () => Promise.reject(new Error("settle_trial_budget failed with 500")) }),
    };
    const { handler, logError } = setup({ envVars: ownerEnv, ledger });
    const events = frames(await (await handler(post(trial))).text()).map((f) => f.data?.type);
    expect(events.at(-1)).toBe("done");
    expect(logError.mock.calls[0][0]).toContain("could not settle the daily budget");
  });

  it("runs a trial on owner keys with the trial limit, then settles what it spent", async () => {
    const ledger = createDailyLedger(1);
    const { handler, calls, createNebius } = setup({ envVars: ownerEnv, ledger });
    const res = await handler(post(trial));
    await res.text();
    expect(createNebius).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "owner-nebius" }));
    expect(calls[0].maxUsd).toBe(TRIAL_MAX_USD);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.004 + 5 * 0.008);
  });

  it("counts the whole reservation when a trial run ends without a done event", async () => {
    const ledger = createDailyLedger(1);
    const { handler } = setup({ envVars: ownerEnv, ledger, run: async () => {} });
    await (await handler(post(trial))).text();
    expect(ledger.spentTodayUsd()).toBeCloseTo(TRIAL_RESERVE_USD);
  });

  it("counts the whole reservation when some calls reported no cost", async () => {
    const ledger = createDailyLedger(1);
    const { handler } = setup({
      envVars: ownerEnv,
      ledger,
      run: async ({ onEvent }) => onEvent({ ...DONE, tavilyCredits: 0, unknownCostCalls: 5 } as RunEvent),
    });
    await (await handler(post(trial))).text();
    expect(ledger.spentTodayUsd()).toBeCloseTo(TRIAL_RESERVE_USD);
  });

  it("stops a run that passes the deadline, so it can still end with done", async () => {
    const { handler, createNebius } = setup({
      runDeadlineMs: 10,
      run: async ({ signal, onEvent }) => {
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
        onEvent({ type: "aborted" });
        onEvent(DONE);
      },
    });
    const events = frames(await (await handler(post(byok))).text()).map((f) => f.data?.type);
    expect(events).toEqual(["aborted", "done"]);
    expect(createNebius).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: NEBIUS_TIMEOUT_MS }));
  });

  it("stops the run when the client disconnects", async () => {
    const client = new AbortController();
    let seen: AbortSignal | undefined;
    let release = () => {};
    const { handler } = setup({
      run: async ({ signal, onEvent }) => {
        seen = signal;
        await new Promise<void>((resolve) => (release = resolve));
        onEvent({ type: "aborted" });
        onEvent(DONE);
      },
    });
    const res = await handler(post(byok, client.signal));
    expect(seen?.aborted).toBe(false);
    client.abort();
    expect(seen?.aborted).toBe(true);
    release();
    const events = frames(await res.text()).map((f) => f.data?.type);
    expect(events).toEqual(["aborted", "done"]);
  });

  it("stops the run when the stream is cancelled, and ignores events sent after", async () => {
    let seen: AbortSignal | undefined;
    let release = () => {};
    let finished: Promise<void> = Promise.resolve();
    const { handler, logError } = setup({
      run: ({ signal, onEvent }) => {
        seen = signal;
        finished = (async () => {
          await new Promise<void>((resolve) => (release = resolve));
          // Events after a cancel must be dropped, not written to the closed stream.
          onEvent({ type: "aborted" });
          onEvent(DONE);
        })();
        return finished;
      },
    });
    const res = await handler(post(byok));
    await res.body?.cancel();
    expect(seen?.aborted).toBe(true);
    release();
    await expect(finished).resolves.toBeUndefined();
    expect(logError).not.toHaveBeenCalled();
  });

  it("ends with a fixed error frame when the run throws, and logs it with keys removed", async () => {
    const { handler, logError } = setup({
      run: async () => {
        throw new Error(`boom with ${NEBIUS_KEY} inside`);
      },
    });
    const text = await (await handler(post(byok))).text();
    expect(frames(text)).toEqual([{ event: "error", data: { error: "run_failed" }, comment: false }]);
    expect(text).not.toContain(NEBIUS_KEY);
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0][0]).not.toContain(NEBIUS_KEY);
  });

  it("saves the run once it ends and sends its id last", async () => {
    const saved: Parameters<RunStore["save"]>[0][] = [];
    const store: RunStore = { save: async (run) => void saved.push(run), load: async () => null };
    const { handler } = setup({ store });
    const all = frames(await (await handler(post(byok))).text());
    expect(saved).toHaveLength(1);
    expect(saved[0].keys).toBe("own");
    expect(saved[0].events.map((e) => e.type)).toEqual(["started", "searched", "done"]);
    expect(isRunId(saved[0].id)).toBe(true);
    expect(all.at(-1)).toEqual({ event: "saved", data: { id: saved[0].id }, comment: false });
    // The id comes first too, so a page whose visitor stops the run can still find it.
    expect(all[0]).toEqual({ event: "run", data: { id: saved[0].id }, comment: false });
    expect(JSON.stringify(saved)).not.toContain(NEBIUS_KEY);
    expect(JSON.stringify(saved)).not.toContain(TAVILY_KEY);
  });

  it("marks a run on the trial keys as a trial when saving it", async () => {
    const saved: string[] = [];
    const store: RunStore = { save: async (run) => void saved.push(run.keys), load: async () => null };
    const { handler } = setup({ store, envVars: ownerEnv, ledger: createDailyLedger(1) });
    await (await handler(post(trial))).text();
    expect(saved).toEqual(["trial"]);
  });

  it("sends no id when saving isn't set up", async () => {
    const { handler } = setup({ store: null });
    const all = frames(await (await handler(post(byok))).text());
    expect(all.map((f) => f.event)).not.toContain("saved");
    expect(all.map((f) => f.event)).not.toContain("run");
  });

  it("logs a failed save with keys removed and sends no id", async () => {
    const store: RunStore = {
      save: async () => {
        throw new Error(`insert refused for ${TAVILY_KEY}`);
      },
      load: async () => null,
    };
    const { handler, logError } = setup({ store });
    const text = await (await handler(post(byok))).text();
    expect(frames(text).map((f) => f.event)).not.toContain("saved");
    expect(frames(text).at(-1)?.data).toMatchObject({ type: "done" });
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0][0]).toContain("could not save the run");
    expect(logError.mock.calls[0][0]).not.toContain(TAVILY_KEY);
  });

  it("saves a run that broke, as far as it got", async () => {
    const saved: string[][] = [];
    const store: RunStore = { save: async (run) => void saved.push(run.events.map((e) => e.type)), load: async () => null };
    const { handler } = setup({
      store,
      run: async ({ onEvent }) => {
        onEvent(STARTED);
        onEvent(SEARCHED);
        throw new Error("boom");
      },
    });
    await (await handler(post(byok))).text();
    expect(saved).toEqual([["started", "searched"]]);
  });

  it("doesn't save a run that ended before it planned or searched, as one with a made-up key does", async () => {
    const saved: unknown[] = [];
    const store: RunStore = { save: async (run) => void saved.push(run), load: async () => null };
    const { handler } = setup({
      store,
      run: async ({ onEvent }) => {
        onEvent(STARTED);
        onEvent({ type: "plan_failed", tier: "super", costUsd: 0, usageKnown: false, latencyMs: 5, reason: "auth: The API key was rejected." });
        onEvent(DONE);
      },
    });
    const all = frames(await (await handler(post(byok))).text());
    expect(saved).toEqual([]);
    expect(all.map((f) => f.event)).not.toContain("saved");
  });

  it("refuses a visitor past the hourly limit, with Retry-After", async () => {
    const { handler, calls } = setup({ envVars: { RUNS_PER_IP_PER_HOUR: "2" } });
    for (let i = 0; i < 2; i++) expect((await handler(post(byok))).status).toBe(200);
    const res = await handler(post(byok));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_runs" });
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(calls).toHaveLength(2);
  });

  it("limits trial runs per visitor per day, apart from runs on their own keys", async () => {
    const { handler, calls } = setup({
      envVars: { ...ownerEnv, TRIAL_RUNS_PER_IP_PER_DAY: "1" },
      ledger: createDailyLedger(10),
    });
    await (await handler(post(trial))).text();
    const res = await handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "trial_limit_reached" });
    expect(Number(res.headers.get("retry-after"))).toBeLessThanOrEqual(86_400);
    expect((await handler(post(byok))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("counts a visitor by the address Vercel gives, and only on Vercel", async () => {
    const vercelHeaders = { "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "192.0.2.9" };
    const onVercel = spyLimiter();
    await setup({ envVars: { VERCEL: "1" }, limiter: onVercel.limiter }).handler(post(byok, undefined, vercelHeaders));
    expect(onVercel.hits.map((h) => h.visitor)).toEqual(["203.0.113.7"]);

    const elsewhere = spyLimiter();
    await setup({ limiter: elsewhere.limiter }).handler(post(byok, undefined, vercelHeaders));
    expect(elsewhere.hits.map((h) => h.visitor)).toEqual(["unknown"]);
  });

  it("gives the budget back when a visitor limit refuses the run", async () => {
    const ledger = createDailyLedger(TRIAL_RESERVE_USD);
    const { limiter } = spyLimiter(async () => false);
    const res = await setup({ envVars: ownerEnv, ledger, limiter }).handler(post(trial));
    expect(res.status).toBe(429);
    expect(ledger.spentTodayUsd()).toBe(0);
    expect(await ledger.reserve(TRIAL_RESERVE_USD)).not.toBeNull();
  });

  it("uses up no count when the day's budget is spent", async () => {
    const { limiter, hits } = spyLimiter();
    const res = await setup({ envVars: ownerEnv, ledger: createDailyLedger(0), limiter }).handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(hits).toEqual([]);
  });

  it("uses up no count when the daily budget can't be checked", async () => {
    const ledger = { reserve: async () => Promise.reject(new Error("reserve_trial_budget failed with 503")) };
    const { limiter, hits } = spyLimiter();
    const res = await setup({ envVars: ownerEnv, ledger, limiter }).handler(post(trial));
    expect(res.status).toBe(503);
    expect(hits).toEqual([]);
  });

  it("uses up no count or budget when the provider clients can't be made", async () => {
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const { limiter, hits } = spyLimiter();
    const res = await setup({
      envVars: ownerEnv,
      ledger,
      limiter,
      createNebius: () => {
        throw new Error("bad setup");
      },
    }).handler(post(trial));
    expect(res.status).toBe(500);
    expect(hits).toEqual([]);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("keeps a visitor's hourly runs when their trial runs are used up", async () => {
    const { handler, calls } = setup({
      envVars: { ...ownerEnv, RUNS_PER_IP_PER_HOUR: "2", TRIAL_RUNS_PER_IP_PER_DAY: "1" },
      ledger: createDailyLedger(10),
    });
    await (await handler(post(trial))).text();
    for (let i = 0; i < 3; i++) expect((await handler(post(trial))).status).toBe(429);
    const own = await handler(post(byok));
    expect(own.status).toBe(200);
    await own.text();
    expect((await handler(post(byok))).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  it("still refuses when giving the budget back fails, and logs it", async () => {
    const settle = vi.fn(async () => Promise.reject(new Error("settle_trial_budget failed with 503")));
    const ledger = { reserve: async () => ({ settle }) };
    const { limiter } = spyLimiter(async () => false);
    const { handler, logError } = setup({ envVars: ownerEnv, ledger, limiter });
    const res = await handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "trial_limit_reached" });
    expect(settle).toHaveBeenCalledWith(0);
    expect(logError.mock.calls[0][0]).toContain("could not release the daily budget");
  });

  it("logs once when Vercel gives no visitor address, without the headers", async () => {
    const { handler, logError } = setup({ envVars: { VERCEL: "1" } });
    const junk = { "x-vercel-forwarded-for": "not-an-address", "x-real-ip": "also-junk" };
    for (let i = 0; i < 2; i++) await (await handler(post(byok, undefined, junk))).text();
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0][0]).toContain("no visitor address");
    expect(logError.mock.calls[0][0]).not.toMatch(/not-an-address|also-junk/);
  });

  it("logs nothing about the address off Vercel, where it is never read", async () => {
    const { handler, logError } = setup();
    await (await handler(post(byok))).text();
    expect(logError).not.toHaveBeenCalled();
  });

  it("refuses a trial run when the visitor limits can't be checked, and gives the budget back", async () => {
    const { limiter } = spyLimiter(async () => Promise.reject(new Error("hit_rate_limit failed with 503")));
    const ledger = createDailyLedger(TRIAL_RESERVE_USD);
    const { handler, calls, logError } = setup({ envVars: ownerEnv, ledger, limiter });
    const res = await handler(post(trial));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "limits_unavailable" });
    expect(calls).toHaveLength(0);
    expect(logError.mock.calls[0][0]).toContain("could not check the trial limit");
    expect(await ledger.reserve(TRIAL_RESERVE_USD)).not.toBeNull();
  });

  it("still runs on the visitor's own keys when the limits can't be checked, and logs it", async () => {
    const { limiter } = spyLimiter(async () => Promise.reject(new Error(`hit_rate_limit failed for ${NEBIUS_KEY}`)));
    const { handler, calls, logError } = setup({ limiter });
    const res = await handler(post(byok));
    expect(res.status).toBe(200);
    await res.text();
    expect(calls).toHaveLength(1);
    expect(logError).toHaveBeenCalledOnce();
    expect(logError.mock.calls[0][0]).not.toContain(NEBIUS_KEY);
  });

  it("reports server setup problems as a 500 without the error text", async () => {
    const { handler, logError } = setup({
      createTavily: () => {
        throw new Error("Unset these environment variables: TAVILY_HTTP_PROXY");
      },
    });
    const res = await handler(post(byok));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_misconfigured" });
    expect(logError).toHaveBeenCalledOnce();
  });

  it("passes an invalid body back as a 400 that names fields, not values", async () => {
    const { handler, calls } = setup();
    const res = await handler(post({ ...byok, quote: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request", fields: ["quote"] });
    expect(calls).toHaveLength(0);
  });
});
