import { describe, expect, it, vi } from "vitest";

import { type RunEvent, runEventSchema } from "../../agent/events";
import type { InvestigationOptions } from "../../agent/orchestrator";
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

const NEBIUS_KEY = "fake-visitor-nebius-key";
const TAVILY_KEY = "fake-visitor-tavily-key";

const DONE: RunEvent = { type: "done", nebiusUsd: 0.004, tavilyCredits: 5, unknownCostCalls: 0, seconds: 1 };

const body = (keys: unknown) => ({ quote: "Gel, gel, ne olursan ol yine gel", popularAttribution: "Rumi", keys });
const byok = body({ mode: "byok", nebiusApiKey: NEBIUS_KEY, tavilyApiKey: TAVILY_KEY });
const trial = body({ mode: "trial" });

const post = (json: unknown, signal?: AbortSignal) =>
  new Request("http://localhost/api/investigate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(json),
    signal,
  });

type Run = (options: InvestigationOptions) => Promise<void>;

const emitDone: Run = async ({ onEvent }) => {
  onEvent({ type: "started", quote: "q", popularAttribution: "Rumi", language: "en", excludeDomains: [] });
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
    expect(events.map((e) => e.type)).toEqual(["started", "done"]);
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
