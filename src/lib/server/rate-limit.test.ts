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

// A counted run gets its window's start back, and a refused one gets null.
const counted = (start: string) => Date.parse(start);

describe("memory limiter", () => {
  it("refuses a visitor past the limit until the window ends", async () => {
    let now = Date.parse("2026-10-12T10:59:00Z");
    const limiter = createMemoryLimiter(() => now);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(counted("2026-10-12T10:00:00Z"));
    expect(await limiter.hit("203.0.113.7", runs)).toBe(counted("2026-10-12T10:00:00Z"));
    expect(await limiter.hit("203.0.113.7", runs)).toBeNull();

    now = Date.parse("2026-10-12T11:00:00Z");
    expect(await limiter.hit("203.0.113.7", runs)).toBe(counted("2026-10-12T11:00:00Z"));
  });

  it("counts each visitor and each limit on its own", async () => {
    const limiter = createMemoryLimiter(() => Date.parse("2026-10-12T10:00:00Z"));
    expect(await limiter.hit("203.0.113.7", trial)).not.toBeNull();
    expect(await limiter.hit("203.0.113.7", trial)).toBeNull();
    expect(await limiter.hit("198.51.100.1", trial)).not.toBeNull();
    expect(await limiter.hit("203.0.113.7", runs)).not.toBeNull();
  });

  it("lets no more runs through than the limit when they arrive together", async () => {
    const limiter = createMemoryLimiter();
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit("203.0.113.7", runs)));
    expect(results.filter((r) => r !== null)).toHaveLength(2);
  });

  it("starts a day's window at UTC midnight", async () => {
    let now = Date.parse("2026-10-12T23:59:59Z");
    const limiter = createMemoryLimiter(() => now);
    expect(await limiter.hit("203.0.113.7", trial)).toBe(counted("2026-10-12T00:00:00Z"));
    expect(await limiter.hit("203.0.113.7", trial)).toBeNull();
    now = Date.parse("2026-10-13T00:00:00Z");
    expect(await limiter.hit("203.0.113.7", trial)).toBe(counted("2026-10-13T00:00:00Z"));
  });

  it("takes a count back, never below 0 and never from another visitor", async () => {
    const limiter = createMemoryLimiter(() => Date.parse("2026-10-12T10:00:00Z"));
    const start = await limiter.hit("203.0.113.7", runs);
    expect(start).not.toBeNull();
    expect(await limiter.hit("203.0.113.7", runs)).toBe(start);
    await limiter.unhit("203.0.113.7", runs, start!);
    expect(await limiter.hit("203.0.113.7", runs)).toBe(start);
    expect(await limiter.hit("203.0.113.7", runs)).toBeNull();

    // Below 0 would let more runs through than the limit.
    for (let i = 0; i < 4; i++) await limiter.unhit("203.0.113.7", runs, start!);
    expect(await limiter.hit("203.0.113.7", runs)).not.toBeNull();
    expect(await limiter.hit("203.0.113.7", runs)).not.toBeNull();
    expect(await limiter.hit("203.0.113.7", runs)).toBeNull();

    // A visitor never counted has nothing to give back.
    await limiter.unhit("198.51.100.1", runs, start!);
    expect(await limiter.hit("198.51.100.1", runs)).not.toBeNull();
    expect(await limiter.hit("198.51.100.1", runs)).not.toBeNull();
    expect(await limiter.hit("198.51.100.1", runs)).toBeNull();
  });

  it.each([
    ["the hour", runs, "2026-10-12T10:59:58Z", "2026-10-12T11:00:01Z"],
    ["the day at UTC midnight", { ...trial, max: 2 }, "2026-10-12T23:59:58Z", "2026-10-13T00:00:01Z"],
  ])("gives a count back to the window it was counted in, after %s turns over", async (_, limit, before, after) => {
    let now = Date.parse(before);
    const limiter = createMemoryLimiter(() => now);
    const first = await limiter.hit("203.0.113.7", limit);
    expect(first).not.toBeNull();

    // Another run from the visitor is counted in the new window, then the first
    // run is refused and gives its count back.
    now = Date.parse(after);
    const second = await limiter.hit("203.0.113.7", limit);
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    await limiter.unhit("203.0.113.7", limit, first!);

    // The new window still holds the second run, so only one more fits.
    expect(await limiter.hit("203.0.113.7", limit)).toBe(second);
    expect(await limiter.hit("203.0.113.7", limit)).toBeNull();
  });
});

describe("shared limiter", () => {
  function fakeRpc(reply: unknown = "2026-10-12T00:00:00+00:00") {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const rpc: SupabaseRpc = vi.fn(async (name, args) => {
      calls.push({ name, args });
      return reply;
    });
    return { rpc, calls };
  }

  it("sends a keyed hash of the visitor, never the address", async () => {
    const { rpc, calls } = fakeRpc();
    expect(await createSharedLimiter(rpc, visitorHashKey(SECRET)).hit("203.0.113.7", trial)).toBe(
      Date.parse("2026-10-12T00:00:00Z"),
    );
    expect(calls[0].name).toBe("hit_rate_limit");
    expect(calls[0].args).toEqual({ p_key: expect.stringMatching(/^trial:[0-9a-f]{32}$/), p_max: 1, p_window_seconds: DAY_SECONDS });
    expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
    expect(JSON.stringify(calls)).not.toContain(SECRET);
  });

  it("gives a count back for the same hashed key, to the window the hit was counted in", async () => {
    const { rpc, calls } = fakeRpc();
    const limiter = createSharedLimiter(rpc, visitorHashKey(SECRET));
    const start = await limiter.hit("203.0.113.7", trial);
    await limiter.unhit("203.0.113.7", trial, start!);
    expect(calls[1]).toEqual({
      name: "unhit_rate_limit",
      args: { p_key: calls[0].args.p_key, p_window_start: "2026-10-12T00:00:00.000Z" },
    });
    expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
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

  it("passes on the database's answer, and throws on one that isn't a time or null", async () => {
    expect(await createSharedLimiter(fakeRpc(null).rpc, visitorHashKey(SECRET)).hit("x", runs)).toBeNull();
    for (const reply of [true, "not a time", 0]) {
      await expect(createSharedLimiter(fakeRpc(reply).rpc, visitorHashKey(SECRET)).hit("x", runs)).rejects.toThrow();
    }
  });

  it("is shared only when Supabase is set up", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json("2026-10-12T10:00:00+00:00"));
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
