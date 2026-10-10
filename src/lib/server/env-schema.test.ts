import { describe, expect, it } from "vitest";

import { EnvError, parseServerEnv, requireOwnerKeys } from "./env-schema";

describe("parseServerEnv", () => {
  it("applies defaults when nothing is set", () => {
    const env = parseServerEnv({});
    expect(env.NEBIUS_BASE_URL).toBe("https://api.tokenfactory.nebius.com/v1/");
    expect(env.LIVE_RUNS_ENABLED).toBe(false);
    expect(env.TRIAL_RUNS_ENABLED).toBe(false);
    expect(env.DAILY_BUDGET_USD).toBe(0);
    expect(env.NEBIUS_API_KEY).toBeUndefined();
  });

  it("treats blank values as unset", () => {
    const env = parseServerEnv({ NEBIUS_API_KEY: "   ", TAVILY_API_KEY: "", LIVE_RUNS_ENABLED: "" });
    expect(env.NEBIUS_API_KEY).toBeUndefined();
    expect(env.TAVILY_API_KEY).toBeUndefined();
    expect(env.LIVE_RUNS_ENABLED).toBe(false);
  });

  it("parses flags and budget", () => {
    const env = parseServerEnv({ LIVE_RUNS_ENABLED: "true", DAILY_BUDGET_USD: "2.5" });
    expect(env.LIVE_RUNS_ENABLED).toBe(true);
    expect(env.DAILY_BUDGET_USD).toBe(2.5);
  });

  it("rejects a non-https base URL", () => {
    expect(() => parseServerEnv({ NEBIUS_BASE_URL: "http://example.com/v1/" })).toThrow(EnvError);
  });

  it("names the bad variable but never echoes its value", () => {
    const secretLooking = "not-a-flag-sk-1234567890abcdef";
    try {
      parseServerEnv({ LIVE_RUNS_ENABLED: secretLooking });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).variables).toEqual(["LIVE_RUNS_ENABLED"]);
      expect((err as Error).message).not.toContain(secretLooking);
    }
  });
});

describe("requireOwnerKeys", () => {
  it("lists every missing owner key", () => {
    const env = parseServerEnv({ TAVILY_API_KEY: "tvly-x" });
    expect(() => requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"])).toThrow("NEBIUS_API_KEY");
    expect(requireOwnerKeys(env, ["TAVILY_API_KEY"])).toEqual({ TAVILY_API_KEY: "tvly-x" });
  });

  it("returns the requested keys", () => {
    const env = parseServerEnv({ NEBIUS_API_KEY: "a", TAVILY_API_KEY: "b" });
    expect(requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"])).toEqual({
      NEBIUS_API_KEY: "a",
      TAVILY_API_KEY: "b",
    });
  });
});
