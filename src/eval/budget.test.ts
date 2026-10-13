import { describe, expect, it } from "vitest";

import { MODELS } from "../agent/models";
import type { ChatParams, ChatResult, NebiusClient } from "../lib/server/providers/nebius";
import { CAP_REACHED, capSpend } from "./budget";

// A model call that takes a few milliseconds and reports the usage it's given.
function fakeNebius(usage: { prompt_tokens: number; completion_tokens: number } | null, watch: () => void = () => {}): NebiusClient & { calls: number } {
  const fake = {
    calls: 0,
    listModels: async () => ({ ok: true as const, ids: [] }),
    chat: async (): Promise<ChatResult> => {
      fake.calls++;
      watch();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, completion: { choices: [], ...(usage && { usage }) } as never, latencyMs: 5 };
    },
  };
  return fake;
}

const judgeCall = (model = MODELS.super): ChatParams => ({
  model: model.id,
  max_tokens: model.judgeMaxTokens,
  messages: [
    { role: "system", content: "You judge a saying." },
    { role: "user", content: "Evidence: ".repeat(50) },
  ],
});

// Workers that keep making calls until one is refused, like rejudge's pool.
async function pool(client: NebiusClient, workers: number, perWorker: number): Promise<ChatResult[]> {
  const results: ChatResult[] = [];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let i = 0; i < perWorker; i++) {
        const result = await client.chat(judgeCall());
        results.push(result);
        if (!result.ok) return;
      }
    }),
  );
  return results;
}

describe("capSpend", () => {
  it("holds the cap with six calls running at once", async () => {
    const maxUsd = 0.05;
    let committedPastCap = false;
    const capped = capSpend(
      fakeNebius({ prompt_tokens: 1_000, completion_tokens: 2_000 }, () => {
        if (capped.committedUsd() > maxUsd) committedPastCap = true;
      }),
      maxUsd,
    );
    const results = await pool(capped.client, 6, 20);
    expect(capped.spentUsd()).toBeLessThanOrEqual(maxUsd);
    expect(committedPastCap).toBe(false);
    expect(capped.refused()).toBeGreaterThan(0);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.kind === "quota" && r.error.message === CAP_REACHED)).toBe(true);
    // Without the cap the same pool would have made 120 calls.
    expect(results.filter((r) => r.ok).length).toBeLessThan(120);
  });

  it("lets calls wait for the ones running to settle instead of stopping for good", async () => {
    // Six Super calls set aside about $0.0074 each, so four fit a $0.03 cap at
    // once. They cost far less, so the other two run once those settle.
    const capped = capSpend(fakeNebius({ prompt_tokens: 500, completion_tokens: 50 }), 0.03);
    const results = await Promise.all(Array.from({ length: 6 }, () => capped.client.chat(judgeCall())));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(capped.refused()).toBe(0);
    expect(capped.spentUsd()).toBeLessThanOrEqual(0.03);
  });

  it("leaves nothing set aside once every call has settled, so a later call never waits on rounding", async () => {
    // Codex's case: after six settled calls, float rounding left about 7e-18 set
    // aside, and a call that fit only what was spent waited for a call that wasn't running.
    const capped = capSpend(fakeNebius({ prompt_tokens: 500, completion_tokens: 50 }), 1);
    await Promise.all(Array.from({ length: 6 }, () => capped.client.chat(judgeCall())));
    expect(capped.committedUsd()).toBe(capped.spentUsd());
  });

  it("refuses a cap that isn't a number of dollars above zero", () => {
    for (const cap of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY]) expect(() => capSpend(fakeNebius(null), cap)).toThrow(/above zero/);
  });

  it("refuses a call that could pass the cap even before anything is spent", async () => {
    const capped = capSpend(fakeNebius({ prompt_tokens: 10, completion_tokens: 10 }), 0.01);
    // An Ultra judge may use 16,000 completion tokens at $3 per million: $0.048.
    const result = await capped.client.chat(judgeCall(MODELS.ultra));
    expect(result.ok).toBe(false);
    expect(capped.spentUsd()).toBe(0);
  });

  it("counts what a call reports, and all it set aside when it reports nothing", async () => {
    const reported = capSpend(fakeNebius({ prompt_tokens: 1_000, completion_tokens: 100 }), 1);
    await reported.client.chat(judgeCall());
    expect(reported.spentUsd()).toBeCloseTo((1_000 * 0.3 + 100 * 0.9) / 1_000_000, 10);
    const silent = capSpend(fakeNebius(null), 1);
    await silent.client.chat(judgeCall());
    expect(silent.spentUsd()).toBeGreaterThan(MODELS.super.judgeMaxTokens * 0.9 / 1_000_000);
    expect(silent.committedUsd()).toBe(silent.spentUsd());
  });
});
