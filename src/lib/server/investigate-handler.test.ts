import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { type RunEvent, runEventSchema } from "../../agent/events";
import type { InvestigationOptions } from "../../agent/orchestrator";
import { isRunId } from "../run-id";
import { createDailyLedger, LEDGER_TIMEOUT_MS, TAVILY_USD_PER_CREDIT } from "./daily-budget";
import { parseServerEnv } from "./env-schema";
import {
  createInvestigateHandler,
  type InvestigateDeps,
  NEBIUS_TIMEOUT_MS,
  RUN_DEADLINE_MS,
  TRIAL_MAX_USD,
  TRIAL_RESERVE_USD,
} from "./investigate-handler";
import type { NebiusClient } from "./providers/nebius";
import { type TavilyClient, TAVILY_TIMEOUT_MS } from "./providers/tavily";
import { createMemoryLimiter, type Limit, type RateLimiter } from "./rate-limit";
import { accessCodeMatches } from "./run-keys";
import { RUN_STORE_TIMEOUT_MS, type RunStore } from "./run-store";
import type { CodeUse, TrialCodes } from "./trial-codes";

// The real comparison, watched, so a test can tell whether a code was compared at all.
vi.mock("./run-keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./run-keys")>();
  return { ...actual, accessCodeMatches: vi.fn(actual.accessCodeMatches) };
});
const compared = vi.mocked(accessCodeMatches);

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

// The window each limit's count lands in, so a give-back can be matched to its hit.
const WINDOW_STARTS: Record<Limit["name"], number> = {
  runs: Date.parse("2026-10-12T10:00:00Z"),
  trial: Date.parse("2026-10-12T00:00:00Z"),
  keys: Date.parse("2026-10-12T10:00:00Z"),
};

// A limiter that remembers who it was asked about and what it gave back, and can be made to fail.
function spyLimiter(
  answer: (limit: Limit) => Promise<boolean> = async () => true,
  giveBack: (limit: Limit) => Promise<void> = async () => {},
) {
  const hits: { visitor: string; limit: Limit; windowStart: number | null }[] = [];
  const unhits: { visitor: string; limit: Limit; windowStart: number }[] = [];
  const limiter: RateLimiter = {
    hit: async (visitor, limit) => {
      const hit = { visitor, limit, windowStart: null as number | null };
      hits.push(hit);
      hit.windowStart = (await answer(limit)) ? WINDOW_STARTS[limit.name] : null;
      return hit.windowStart;
    },
    unhit: async (visitor, limit, windowStart) => {
      unhits.push({ visitor, limit, windowStart });
      return giveBack(limit);
    },
  };
  return { limiter, hits, unhits };
}

const names = (counted: { limit: Limit }[]) => counted.map((c) => c.limit.name).sort();

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
    expect(calls[0].input).toMatchObject({ language: null, excludeDomains: ["quoteinvestigator.com"] });
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

  it("refuses trial runs on Vercel when Supabase isn't set, before counting or reserving anything", async () => {
    const { limiter, hits } = spyLimiter();
    const reserve = vi.fn(async () => null);
    const { handler, calls } = setup({ envVars: { ...ownerEnv, VERCEL: "1" }, limiter, ledger: { reserve } });
    const res = await handler(post(trial));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trial_disabled" });
    expect(hits).toHaveLength(0);
    expect(reserve).not.toHaveBeenCalled();
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

  it("counts the deadline from when the request came in, so slow checks use it up", async () => {
    // The visitor count takes longer than the whole deadline, so the run must
    // start already stopped instead of getting a fresh deadline of its own.
    const { limiter } = spyLimiter(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return true;
    });
    let abortedAtStart: boolean | undefined;
    const { handler } = setup({
      runDeadlineMs: 20,
      limiter,
      run: async ({ signal, onEvent }) => {
        abortedAtStart = signal?.aborted;
        onEvent({ type: "aborted" });
        onEvent(DONE);
      },
    });
    await (await handler(post(byok))).text();
    expect(abortedAtStart).toBe(true);
  });

  it("still settles the budget and saves the run, in that order, when the deadline stops it", async () => {
    const ledger = createDailyLedger(1);
    const order: string[] = [];
    const store: RunStore = {
      save: async (run) => {
        order.push(`save ${ledger.spentTodayUsd().toFixed(3)} ${run.events.map((e) => e.type).join(",")}`);
      },
      load: async () => null,
    };
    const { handler } = setup({
      envVars: ownerEnv,
      ledger,
      store,
      runDeadlineMs: 10,
      run: async ({ signal, onEvent }) => {
        onEvent(STARTED);
        onEvent(SEARCHED);
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
        onEvent({ type: "aborted" });
        onEvent(DONE);
      },
    });
    const all = frames(await (await handler(post(trial))).text());
    // DONE's own spend ($0.004 and five credits), not the whole reservation: every cost was known.
    const spent = 0.004 + 5 * TAVILY_USD_PER_CREDIT;
    expect(ledger.spentTodayUsd()).toBeCloseTo(spent);
    expect(order).toEqual([`save ${spent.toFixed(3)} started,searched,aborted,done`]);
    expect(all.at(-1)?.event).toBe("saved");
  });

  it("leaves time after the deadline for a running call, the budget and the save", () => {
    const route = readFileSync(new URL("../../app/api/investigate/route.ts", import.meta.url), "utf8");
    const maxDuration = Number(/export const maxDuration = (\d+);/.exec(route)?.[1]);
    expect(maxDuration).toBe(300);
    const slowestCall = Math.max(NEBIUS_TIMEOUT_MS, TAVILY_TIMEOUT_MS);
    const worstCase = RUN_DEADLINE_MS + slowestCall + LEDGER_TIMEOUT_MS + RUN_STORE_TIMEOUT_MS;
    // Some margin for the work between those steps.
    expect(worstCase).toBeLessThanOrEqual(maxDuration * 1000 - 15_000);
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

  it("settles a trial's reservation when the run throws before returning a promise", async () => {
    const ledger = createDailyLedger(1);
    const { handler, logError } = setup({
      envVars: ownerEnv,
      ledger,
      run: () => {
        throw new Error(`thrown at once with ${ownerEnv.NEBIUS_API_KEY}`);
      },
    });
    const text = await (await handler(post(trial))).text();
    expect(frames(text).at(-1)).toEqual({ event: "error", data: { error: "run_failed" }, comment: false });
    expect(logError.mock.calls[0][0]).toContain("run failed");
    expect(logError.mock.calls[0][0]).not.toContain(ownerEnv.NEBIUS_API_KEY);
    // No done event, so the whole reservation counts as spent, and none is left held.
    expect(ledger.spentTodayUsd()).toBeCloseTo(TRIAL_RESERVE_USD);
    expect(await ledger.reserve(1 - TRIAL_RESERVE_USD)).not.toBeNull();
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

  it("never touches the budget for a visitor at their limit, however many requests they send", async () => {
    const ledger = createDailyLedger(TRIAL_RESERVE_USD);
    const reserve = vi.spyOn(ledger, "reserve");
    const { limiter, unhits } = spyLimiter(async () => false);
    const { handler } = setup({ envVars: ownerEnv, ledger, limiter });
    const responses = await Promise.all(Array.from({ length: 5 }, () => handler(post(trial))));
    expect(responses.map((r) => r.status)).toEqual([429, 429, 429, 429, 429]);
    expect(reserve).not.toHaveBeenCalled();
    expect(unhits).toEqual([]);
  });

  it("gives back the trial count when the hourly limit refuses a trial run", async () => {
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const { limiter, unhits } = spyLimiter(async (limit) => limit.name === "trial");
    const res = await setup({ envVars: ownerEnv, ledger, limiter }).handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_many_runs" });
    expect(names(unhits)).toEqual(["trial"]);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("gives back both counts when the day's budget is spent", async () => {
    const { limiter, hits, unhits } = spyLimiter();
    const res = await setup({ envVars: ownerEnv, ledger: createDailyLedger(0), limiter }).handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(names(hits)).toEqual(["runs", "trial"]);
    expect(unhits).toEqual(hits);
  });

  it("gives back both counts when the daily budget can't be checked", async () => {
    const ledger = { reserve: async () => Promise.reject(new Error("reserve_trial_budget failed with 503")) };
    const { limiter, hits, unhits } = spyLimiter();
    const res = await setup({ envVars: ownerEnv, ledger, limiter }).handler(post(trial));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "limits_unavailable" });
    expect(names(unhits)).toEqual(["runs", "trial"]);
    expect(unhits).toEqual(hits);
  });

  it("leaves a visitor's counts as they were when the budget refuses, with the real limiter", async () => {
    const { handler } = setup({
      envVars: { ...ownerEnv, RUNS_PER_IP_PER_HOUR: "1", TRIAL_RUNS_PER_IP_PER_DAY: "1" },
      ledger: createDailyLedger(0),
    });
    // A leaked trial count would refuse the second request with trial_limit_reached instead.
    for (let i = 0; i < 3; i++) {
      const res = await handler(post(trial));
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    }
    const own = await handler(post(byok));
    expect(own.status).toBe(200);
    await own.text();
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

  it("still refuses when giving a count back fails, and logs it", async () => {
    const { limiter, unhits } = spyLimiter(
      async () => true,
      async () => Promise.reject(new Error(`unhit_rate_limit failed for ${ownerEnv.NEBIUS_API_KEY}`)),
    );
    const { handler, calls, logError } = setup({ envVars: ownerEnv, ledger: createDailyLedger(0), limiter });
    const res = await handler(post(trial));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(unhits).toHaveLength(2);
    expect(calls).toHaveLength(0);
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError.mock.calls[0][0]).toContain("could not give back the");
    expect(logError.mock.calls[0][0]).not.toContain(ownerEnv.NEBIUS_API_KEY);
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

  it("refuses a trial run when the visitor limits can't be checked, without touching the budget", async () => {
    const { limiter, unhits } = spyLimiter(async () => Promise.reject(new Error("hit_rate_limit failed with 503")));
    const ledger = createDailyLedger(TRIAL_RESERVE_USD);
    const reserve = vi.spyOn(ledger, "reserve");
    const { handler, calls, logError } = setup({ envVars: ownerEnv, ledger, limiter });
    const res = await handler(post(trial));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "limits_unavailable" });
    expect(calls).toHaveLength(0);
    expect(logError.mock.calls[0][0]).toContain("could not check the trial limit");
    expect(reserve).not.toHaveBeenCalled();
    expect(unhits).toEqual([]);
  });

  it("gives back the trial count when the hourly limit can't be checked on a trial run", async () => {
    const { limiter, unhits } = spyLimiter(async (limit) =>
      limit.name === "trial" ? true : Promise.reject(new Error("hit_rate_limit failed with 503")),
    );
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const res = await setup({ envVars: ownerEnv, ledger, limiter }).handler(post(trial));
    expect(res.status).toBe(503);
    expect(names(unhits)).toEqual(["trial"]);
    expect(reserve).not.toHaveBeenCalled();
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

describe("POST /api/investigate with an access code", () => {
  const CODE = "judges-only-code-123";
  const codeEnv = { ...ownerEnv, TRIAL_ACCESS_CODE: CODE };
  const withCode = (accessCode?: string) => body({ mode: "trial", ...(accessCode === undefined ? {} : { accessCode }) });

  it("runs a trial on owner keys for the right code, counted by the hour only", async () => {
    const ledger = createDailyLedger(1);
    const { limiter, hits } = spyLimiter();
    const { handler, calls, createNebius } = setup({ envVars: codeEnv, ledger, limiter });
    const res = await handler(post(withCode(` ${CODE} `)));
    expect(res.status).toBe(200);
    await res.text();
    expect(createNebius).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "owner-nebius" }));
    expect(calls[0].maxUsd).toBe(TRIAL_MAX_USD);
    expect(names(hits)).toEqual(["runs"]);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.004 + 5 * 0.008);
  });

  it("lets a code holder past the daily trial limit, while the budget still caps the day", async () => {
    const { handler, calls } = setup({
      envVars: { ...codeEnv, TRIAL_RUNS_PER_IP_PER_DAY: "1" },
      // Room for two reservations at once; each run settles at much less.
      ledger: createDailyLedger(2 * TRIAL_RESERVE_USD),
    });
    for (let i = 0; i < 3; i++) {
      const res = await handler(post(withCode(CODE)));
      expect(res.status).toBe(200);
      await res.text();
    }
    expect(calls).toHaveLength(3);

    const spent = setup({ envVars: codeEnv, ledger: createDailyLedger(0) });
    const res = await spent.handler(post(withCode(CODE)));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
  });

  it("refuses a wrong code, keeps its hourly count and never touches the trial limit or budget", async () => {
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const { limiter, hits, unhits } = spyLimiter();
    const { handler, calls } = setup({ envVars: codeEnv, ledger, limiter });
    const res = await handler(post(withCode("judges-only-code-124")));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "access_code_wrong" });
    expect(names(hits)).toEqual(["runs"]);
    expect(unhits).toEqual([]);
    expect(reserve).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("asks for the code when none is sent, and counts that like a wrong one", async () => {
    for (const request of [withCode(), withCode("   ")]) {
      const ledger = createDailyLedger(1);
      const reserve = vi.spyOn(ledger, "reserve");
      const { limiter, hits, unhits } = spyLimiter();
      const { handler, calls } = setup({ envVars: codeEnv, ledger, limiter });
      const res = await handler(post(request));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "access_code_required" });
      expect(names(hits)).toEqual(["runs"]);
      expect(unhits).toEqual([]);
      expect(reserve).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    }
  });

  it("makes guessing as slow as the hourly limit, and then refuses even the right code", async () => {
    const { handler, calls } = setup({
      envVars: { ...codeEnv, RUNS_PER_IP_PER_HOUR: "2" },
      ledger: createDailyLedger(1),
    });
    for (let i = 0; i < 2; i++) expect((await handler(post(withCode(`guess-number-${i}-abc`)))).status).toBe(403);
    const third = await handler(post(withCode("guess-number-2-abc")));
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "too_many_runs" });
    expect(Number(third.headers.get("retry-after"))).toBeLessThanOrEqual(3600);
    expect((await handler(post(withCode(CODE)))).status).toBe(429);
    expect(calls).toHaveLength(0);
  });

  it("refuses every code attempt it can't count, wrong or right, without comparing it", async () => {
    for (const sent of ["judges-only-code-124", CODE]) {
      compared.mockClear();
      const ledger = createDailyLedger(1);
      const reserve = vi.spyOn(ledger, "reserve");
      const { limiter, hits } = spyLimiter(async () => Promise.reject(new Error("hit_rate_limit failed with 503")));
      const { handler, calls, logError } = setup({ envVars: codeEnv, ledger, limiter });
      const res = await handler(post(withCode(sent)));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "limits_unavailable" });
      expect(names(hits)).toEqual(["runs"]);
      expect(reserve).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
      expect(logError.mock.calls[0][0]).toContain("could not count an access code attempt");
      expect(compared).not.toHaveBeenCalled();
    }
  });

  it("compares a code only once its attempt is counted, and not at all when the count refuses it", async () => {
    for (const sent of ["judges-only-code-124", CODE]) {
      compared.mockClear();
      const { limiter } = spyLimiter(async () => false);
      const res = await setup({ envVars: codeEnv, ledger: createDailyLedger(1), limiter }).handler(post(withCode(sent)));
      expect(res.status).toBe(429);
      expect(compared).not.toHaveBeenCalled();
    }
    for (const [sent, status] of [
      ["judges-only-code-124", 403],
      [CODE, 200],
    ] as const) {
      compared.mockClear();
      const res = await setup({ envVars: codeEnv, ledger: createDailyLedger(1) }).handler(post(withCode(sent)));
      expect(res.status).toBe(status);
      await res.text();
      expect(compared).toHaveBeenCalledTimes(1);
    }
  });

  it("counts a right code's run once against the hourly limit, and gives it back if the budget refuses", async () => {
    const { limiter, hits, unhits } = spyLimiter();
    const res = await setup({ envVars: codeEnv, ledger: createDailyLedger(0), limiter }).handler(post(withCode(CODE)));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(names(hits)).toEqual(["runs"]);
    expect(unhits).toEqual(hits);
  });

  it("gives a code holder their full hourly runs, with the real limiter", async () => {
    const { handler, calls } = setup({
      envVars: { ...codeEnv, RUNS_PER_IP_PER_HOUR: "2" },
      ledger: createDailyLedger(1),
    });
    for (let i = 0; i < 2; i++) {
      const res = await handler(post(withCode(CODE)));
      expect(res.status).toBe(200);
      await res.text();
    }
    expect((await handler(post(withCode(CODE)))).status).toBe(429);
    expect(calls).toHaveLength(2);
  });

  it("never sends the code back, whatever the answer", async () => {
    const { handler } = setup({ envVars: codeEnv, ledger: createDailyLedger(1) });
    for (const sent of [undefined, "judges-only-code-124", CODE]) {
      const res = await handler(post(withCode(sent)));
      expect(await res.text()).not.toContain(CODE);
    }
  });

  it("leaves BYOK runs alone", async () => {
    const { handler, calls } = setup({ envVars: codeEnv });
    const res = await handler(post(byok));
    expect(res.status).toBe(200);
    await res.text();
    expect(calls).toHaveLength(1);
  });

  it("says the trial is off before it says anything about the code", async () => {
    const { handler } = setup({ envVars: { ...codeEnv, TRIAL_RUNS_ENABLED: "false" } });
    const res = await handler(post(withCode("judges-only-code-124")));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trial_disabled" });
  });

  it("behaves as before when no code is set: a sent code is ignored and the daily trial limit applies", async () => {
    const { limiter, hits } = spyLimiter();
    const { handler, calls } = setup({ envVars: ownerEnv, ledger: createDailyLedger(1), limiter });
    const res = await handler(post(withCode("anything-at-all-123")));
    expect(res.status).toBe(200);
    await res.text();
    expect(names(hits)).toEqual(["runs", "trial"]);
    expect(calls).toHaveLength(1);
  });
});

// Counted codes, as trial-codes.ts keeps them in Supabase: each holds the runs it has left.
function fakeCodes(left: Record<string, number>, fail = false) {
  const runsLeft = new Map(Object.entries(left));
  const used: string[] = [];
  const givenBack: string[] = [];
  const trialCodes: TrialCodes = {
    async use(code): Promise<CodeUse> {
      used.push(code);
      if (fail) throw new Error("use_trial_code failed with 503");
      const n = runsLeft.get(code);
      if (n === undefined) return "unknown";
      if (n === 0) return "used_up";
      runsLeft.set(code, n - 1);
      return "ok";
    },
    async giveBack(code) {
      givenBack.push(code);
      runsLeft.set(code, (runsLeft.get(code) ?? 0) + 1);
    },
  };
  return { trialCodes, used, givenBack, runsLeft };
}

describe("POST /api/investigate with a counted access code", () => {
  const SHARED = "judges-only-code-123";
  const COUNTED = "counted-code-for-one-run";
  const codeEnv = { ...ownerEnv, TRIAL_ACCESS_CODE: SHARED };
  const withCode = (accessCode: string) => body({ mode: "trial", accessCode });

  it("runs a trial for a counted code and takes one of its runs, counted by the hour only", async () => {
    const codes = fakeCodes({ [COUNTED]: 2 });
    const { limiter, hits, unhits } = spyLimiter();
    const { handler, calls } = setup({ envVars: codeEnv, ledger: createDailyLedger(1), limiter, trialCodes: codes.trialCodes });
    const res = await handler(post(withCode(` ${COUNTED} `)));
    expect(res.status).toBe(200);
    await res.text();
    expect(calls).toHaveLength(1);
    expect(codes.used).toEqual([COUNTED]);
    expect(codes.runsLeft.get(COUNTED)).toBe(1);
    expect(names(hits)).toEqual(["runs"]);
    expect(unhits).toEqual([]);
  });

  it("refuses a code once its runs are taken, and gives that attempt's hourly count back", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 });
    const { limiter, hits, unhits } = spyLimiter();
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const { handler, calls } = setup({ envVars: codeEnv, ledger, limiter, trialCodes: codes.trialCodes });
    const first = await handler(post(withCode(COUNTED)));
    expect(first.status).toBe(200);
    await first.text();
    const second = await handler(post(withCode(COUNTED)));
    expect(second.status).toBe(403);
    expect(await second.json()).toEqual({ error: "access_code_used_up" });
    expect(calls).toHaveLength(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(names(hits)).toEqual(["runs", "runs"]);
    expect(unhits).toEqual([hits[1]]);
    expect(codes.givenBack).toEqual([]);
  });

  it("gives the code's run back when the budget refuses the run", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 });
    const { limiter, hits, unhits } = spyLimiter();
    const res = await setup({ envVars: codeEnv, ledger: createDailyLedger(0), limiter, trialCodes: codes.trialCodes }).handler(
      post(withCode(COUNTED)),
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily_budget_spent" });
    expect(codes.givenBack).toEqual([COUNTED]);
    expect(codes.runsLeft.get(COUNTED)).toBe(1);
    expect(unhits).toEqual(hits);
  });

  it("refuses a code it doesn't know as wrong, and keeps its hourly count", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 });
    const { limiter, hits, unhits } = spyLimiter();
    const { handler, calls } = setup({ envVars: codeEnv, ledger: createDailyLedger(1), limiter, trialCodes: codes.trialCodes });
    const res = await handler(post(withCode("not-a-code-anyone-has")));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "access_code_wrong" });
    expect(names(hits)).toEqual(["runs"]);
    expect(unhits).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("starts no trial run when it can't count the code's run, and keeps the hourly count", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 }, true);
    const { limiter, unhits } = spyLimiter();
    const ledger = createDailyLedger(1);
    const reserve = vi.spyOn(ledger, "reserve");
    const { handler, calls, logError } = setup({ envVars: codeEnv, ledger, limiter, trialCodes: codes.trialCodes });
    const res = await handler(post(withCode(COUNTED)));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "limits_unavailable" });
    expect(unhits).toEqual([]);
    expect(reserve).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(logError.mock.calls[0][0]).toContain("could not count an access code's run");
    expect(logError.mock.calls[0][0]).not.toContain(COUNTED);
  });

  it("never counts the shared code, or an attempt the hourly limit refuses", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 });
    const shared = await setup({ envVars: codeEnv, ledger: createDailyLedger(1), trialCodes: codes.trialCodes }).handler(
      post(withCode(SHARED)),
    );
    expect(shared.status).toBe(200);
    await shared.text();
    const { limiter } = spyLimiter(async () => false);
    const limited = await setup({ envVars: codeEnv, ledger: createDailyLedger(1), limiter, trialCodes: codes.trialCodes }).handler(
      post(withCode(COUNTED)),
    );
    expect(limited.status).toBe(429);
    expect(codes.used).toEqual([]);
  });

  it("takes counted codes only while the trial asks for a code", async () => {
    const codes = fakeCodes({ [COUNTED]: 1 });
    const res = await setup({ envVars: ownerEnv, ledger: createDailyLedger(1), trialCodes: codes.trialCodes }).handler(
      post(withCode(COUNTED)),
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(codes.used).toEqual([]);
  });

  it("takes only the shared code when there is nowhere to count codes", async () => {
    const { handler } = setup({ envVars: codeEnv, ledger: createDailyLedger(1), trialCodes: null });
    const res = await handler(post(withCode(COUNTED)));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "access_code_wrong" });
  });
});
