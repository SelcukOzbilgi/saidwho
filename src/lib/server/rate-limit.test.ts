import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "./env-schema";
import {
  createMemoryLimiter,
  createSharedLimiter,
  DAY_SECONDS,
  HOUR_SECONDS,
  type Limit,
  limiterFromEnv,
  secondsLeftInWindow,
  visitorHashKey,
} from "./rate-limit";
import type { SupabaseRpc } from "./supabase-rpc";

const runs: Limit = { name: "runs", max: 2, windowSeconds: HOUR_SECONDS };
const trial: Limit = { name: "trial", max: 1, windowSeconds: DAY_SECONDS };
const SECRET = "sb_secret_fake-for-tests-only"; // gitleaks:allow

describe("memory limiter", () => {
  it("refuses a visitor past the limit until the window ends", async () => {
    let now = Date.parse("2026-10-12T10:59:00Z");
    const limiter = createMemoryLimiter(() => now);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(true);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(true);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(false);

    now = Date.parse("2026-10-12T11:00:00Z");
    expect(await limiter.hit("203.0.113.7", runs)).toBe(true);
  });

  it("counts each visitor and each limit on its own", async () => {
    const limiter = createMemoryLimiter(() => Date.parse("2026-10-12T10:00:00Z"));
    expect(await limiter.hit("203.0.113.7", trial)).toBe(true);
    expect(await limiter.hit("203.0.113.7", trial)).toBe(false);
    expect(await limiter.hit("198.51.100.1", trial)).toBe(true);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(true);
  });

  it("lets no more runs through than the limit when they arrive together", async () => {
    const limiter = createMemoryLimiter();
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit("203.0.113.7", runs)));
    expect(results.filter(Boolean)).toHaveLength(2);
  });

  it("starts a day's window at UTC midnight", async () => {
    let now = Date.parse("2026-10-12T23:59:59Z");
    const limiter = createMemoryLimiter(() => now);
    expect(await limiter.hit("203.0.113.7", trial)).toBe(true);
    expect(await limiter.hit("203.0.113.7", trial)).toBe(false);
    now = Date.parse("2026-10-13T00:00:00Z");
    expect(await limiter.hit("203.0.113.7", trial)).toBe(true);
  });
});

describe("shared limiter", () => {
  function fakeRpc(reply: unknown = true) {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc: SupabaseRpc = vi.fn(async (name, args) => {
      calls.push({ name, args });
      return reply;
    });
    return { rpc, calls };
  }

  it("sends a keyed hash of the visitor, never the address", async () => {
    const { rpc, calls } = fakeRpc();
    expect(await createSharedLimiter(rpc, visitorHashKey(SECRET)).hit("203.0.113.7", trial)).toBe(true);
    expect(calls[0].name).toBe("hit_rate_limit");
    expect(calls[0].args).toEqual({ p_key: expect.stringMatching(/^trial:[0-9a-f]{32}$/), p_max: 1, p_window_seconds: DAY_SECONDS });
    expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(calls)).not.toContain(SECRET);
  });

  it("hashes a visitor the same way on every instance with the same secret, and not otherwise", async () => {
    const seen: string[] = [];
    for (const secret of [SECRET, SECRET, "another-fake-secret"]) {
      const { rpc, calls } = fakeRpc();
      await createSharedLimiter(rpc, visitorHashKey(secret)).hit("203.0.113.7", runs);
      seen.push(String(calls[0].args.p_key));
    }
    expect(seen[0]).toBe(seen[1]);
    expect(seen[2]).not.toBe(seen[0]);
  });

  it("passes on the database's answer, and throws on one that isn't true or false", async () => {
    expect(await createSharedLimiter(fakeRpc(false).rpc, visitorHashKey(SECRET)).hit("x", runs)).toBe(false);
    await expect(createSharedLimiter(fakeRpc(null).rpc, visitorHashKey(SECRET)).hit("x", runs)).rejects.toThrow();
  });

  it("is shared only when Supabase is set up", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(true));
    try {
      await limiterFromEnv(parseServerEnv({})).hit("x", runs);
      expect(fetch).not.toHaveBeenCalled();
      const env = parseServerEnv({ SUPABASE_URL: "https://project.supabase.co", SUPABASE_SECRET_KEY: SECRET });
      await limiterFromEnv(env).hit("x", runs);
      expect(String(fetch.mock.calls[0][0])).toBe("https://project.supabase.co/rest/v1/rpc/hit_rate_limit");
    } finally {
      fetch.mockRestore();
    }
  });
});

describe("secondsLeftInWindow", () => {
  it("counts to the end of the window", () => {
    expect(secondsLeftInWindow(HOUR_SECONDS, Date.parse("2026-10-12T10:59:30Z"))).toBe(30);
    expect(secondsLeftInWindow(DAY_SECONDS, Date.parse("2026-10-12T00:00:00Z"))).toBe(DAY_SECONDS);
  });
});
