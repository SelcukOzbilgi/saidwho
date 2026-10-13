import { describe, expect, it } from "vitest";

import { EnvError, parseServerEnv, requireOwnerKeys } from "./env-schema";

describe("parseServerEnv", () => {
  it("applies defaults when nothing is set", () => {
    const env = parseServerEnv({});
    expect(env.NEBIUS_BASE_URL).toBe("https://api.tokenfactory.nebius.com/v1/");
    expect(env.LIVE_RUNS_ENABLED).toBe(false);
    expect(env.TRIAL_RUNS_ENABLED).toBe(false);
    expect(env.DAILY_BUDGET_USD).toBe(0);
    expect(env.RUNS_PER_IP_PER_HOUR).toBe(10);
    expect(env.TRIAL_RUNS_PER_IP_PER_DAY).toBe(3);
    expect(env.NEBIUS_API_KEY).toBeUndefined();
    expect(env.TRIAL_ACCESS_CODE).toBeUndefined();
  });

  it("takes a trial access code that survives a link, and names a bad one without echoing it", () => {
    expect(parseServerEnv({ TRIAL_ACCESS_CODE: " judges-only-code-123 " }).TRIAL_ACCESS_CODE).toBe(
      "judges-only-code-123",
    );
    expect(parseServerEnv({ TRIAL_ACCESS_CODE: "  " }).TRIAL_ACCESS_CODE).toBeUndefined();
    // Shorter than 20 characters is refused: the hourly count alone can't stop guessing.
    expect(parseServerEnv({ TRIAL_ACCESS_CODE: "x".repeat(20) }).TRIAL_ACCESS_CODE).toBe("x".repeat(20));
    expect(parseServerEnv({ TRIAL_ACCESS_CODE: "Ab9_-.~Zz0aB9_-.~Zz0" }).TRIAL_ACCESS_CODE).toBe("Ab9_-.~Zz0aB9_-.~Zz0");
    // Characters a #code= link could cut short or garble (&, #, %) are refused, and so is anything else outside the set.
    const linkBreakers = ["judges&only-code-1234", "judges%only-code-1234", "judges#only-code-1234", "judges+only/code=1234"];
    for (const code of ["short-code1", "nineteen-chars-long", "has-a-space in-it-here", "x".repeat(201), ...linkBreakers]) {
      try {
        parseServerEnv({ TRIAL_ACCESS_CODE: code });
        expect.unreachable();
      } catch (err) {
        expect((err as EnvError).variables).toEqual(["TRIAL_ACCESS_CODE"]);
        expect((err as Error).message).not.toContain(code);
      }
    }
  });

  it("parses the visitor limits, and refuses ones that can't be counted", () => {
    const env = parseServerEnv({ RUNS_PER_IP_PER_HOUR: "20", TRIAL_RUNS_PER_IP_PER_DAY: " " });
    expect(env.RUNS_PER_IP_PER_HOUR).toBe(20);
    expect(env.TRIAL_RUNS_PER_IP_PER_DAY).toBe(3);
    expect(() => parseServerEnv({ RUNS_PER_IP_PER_HOUR: "0" })).toThrow(EnvError);
    expect(() => parseServerEnv({ TRIAL_RUNS_PER_IP_PER_DAY: "1.5" })).toThrow(EnvError);
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

  it("takes only a Supabase secret key, not an older service_role JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl"; // gitleaks:allow
    try {
      parseServerEnv({ SUPABASE_SECRET_KEY: jwt });
      expect.unreachable();
    } catch (err) {
      expect((err as EnvError).variables).toEqual(["SUPABASE_SECRET_KEY"]);
      expect((err as Error).message).not.toContain(jwt);
    }
    expect(parseServerEnv({ SUPABASE_SECRET_KEY: " sb_secret_for-tests-only " }).SUPABASE_SECRET_KEY).toBe(
      "sb_secret_for-tests-only",
    );
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
