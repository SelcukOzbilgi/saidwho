import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env-schema";
import { accessCodeMatches, resolveRunKeys, trialRefusal } from "./run-keys";

const ownerEnv = (overrides: Record<string, string> = {}) =>
  parseServerEnv({
    NEBIUS_API_KEY: "owner-nebius",
    TAVILY_API_KEY: "owner-tavily",
    LIVE_RUNS_ENABLED: "true",
    TRIAL_RUNS_ENABLED: "true",
    ...overrides,
  });

describe("resolveRunKeys", () => {
  it("never falls back to owner keys when a BYOK key is blank or missing", () => {
    const env = ownerEnv();
    for (const request of [
      { mode: "byok" as const },
      { mode: "byok" as const, nebiusApiKey: "visitor", tavilyApiKey: "  " },
      { mode: "byok" as const, nebiusApiKey: "", tavilyApiKey: "visitor" },
    ]) {
      expect(resolveRunKeys(request, env)).toEqual({ ok: false, reason: "byok_incomplete" });
    }
  });

  it("uses trimmed visitor keys for BYOK", () => {
    const result = resolveRunKeys({ mode: "byok", nebiusApiKey: " v-neb ", tavilyApiKey: "v-tav\n" }, ownerEnv());
    expect(result).toEqual({
      ok: true,
      keys: { source: "byok", nebiusApiKey: "v-neb", tavilyApiKey: "v-tav", withCode: false },
    });
  });

  it("refuses trial runs unless both switches are on", () => {
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv({ TRIAL_RUNS_ENABLED: "false" }))).toEqual({
      ok: false,
      reason: "trial_disabled",
    });
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv({ LIVE_RUNS_ENABLED: "false" }))).toEqual({
      ok: false,
      reason: "trial_disabled",
    });
  });

  it("keeps the trial off on Vercel unless both Supabase variables are set", () => {
    const url = "https://project.supabase.co";
    const key = "sb_secret_fake-for-tests-only"; // gitleaks:allow
    const halves: Record<string, string>[] = [{}, { SUPABASE_URL: url }, { SUPABASE_SECRET_KEY: key }];
    for (const supabase of halves) {
      const env = ownerEnv({ VERCEL: "1", ...supabase });
      expect(resolveRunKeys({ mode: "trial" }, env)).toEqual({ ok: false, reason: "trial_disabled" });
      expect(trialRefusal(env)).toBe("trial_disabled");
      // Only the trial: a visitor's own keys still run.
      expect(resolveRunKeys({ mode: "byok", nebiusApiKey: "v-neb", tavilyApiKey: "v-tav" }, env)).toMatchObject({
        ok: true,
      });
    }
    const shared = ownerEnv({ VERCEL: "1", SUPABASE_URL: url, SUPABASE_SECRET_KEY: key });
    expect(resolveRunKeys({ mode: "trial" }, shared)).toMatchObject({ ok: true, keys: { source: "owner" } });
    expect(trialRefusal(shared)).toBeNull();
  });

  it("keeps the trial on off Vercel without Supabase, where one process keeps the counts", () => {
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv())).toMatchObject({ ok: true, keys: { source: "owner" } });
    expect(trialRefusal(ownerEnv())).toBeNull();
  });

  it("gives the page the same answer as the API", () => {
    const off: Record<string, string>[] = [
      { TRIAL_RUNS_ENABLED: "false" },
      { LIVE_RUNS_ENABLED: "false" },
      { VERCEL: "1" },
      { NEBIUS_API_KEY: "" },
    ];
    for (const overrides of off) {
      const env = ownerEnv(overrides);
      const resolved = resolveRunKeys({ mode: "trial" }, env);
      expect(resolved.ok).toBe(false);
      expect(trialRefusal(env)).toBe(resolved.ok ? null : resolved.reason);
    }
  });

  it("reports missing owner keys for trial runs", () => {
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv({ TAVILY_API_KEY: "" }))).toEqual({
      ok: false,
      reason: "owner_keys_missing",
    });
  });

  it("uses owner keys for an enabled trial run", () => {
    const result = resolveRunKeys({ mode: "trial" }, ownerEnv());
    expect(result).toEqual({
      ok: true,
      keys: { source: "owner", nebiusApiKey: "owner-nebius", tavilyApiKey: "owner-tavily", withCode: false },
    });
  });

  it("leaves the access code to the handler, which counts the attempt before checking it", () => {
    // Even a wrong code resolves here: comparing it before the attempt is counted would let guessing go unslowed.
    const env = ownerEnv({ TRIAL_ACCESS_CODE: "judges-only-code-123" });
    expect(resolveRunKeys({ mode: "trial", accessCode: "wrong" }, env)).toMatchObject({ ok: true, keys: { withCode: true } });
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv({ TRIAL_ACCESS_CODE: "judges-only-code-123", TAVILY_API_KEY: "" }))).toEqual({
      ok: false,
      reason: "owner_keys_missing",
    });
  });

  it("marks a trial run that needs the code checked", () => {
    const result = resolveRunKeys(
      { mode: "trial", accessCode: "judges-only-code-123\n" },
      ownerEnv({ TRIAL_ACCESS_CODE: "judges-only-code-123" }),
    );
    expect(result).toEqual({
      ok: true,
      keys: { source: "owner", nebiusApiKey: "owner-nebius", tavilyApiKey: "owner-tavily", withCode: true },
    });
  });
});

describe("accessCodeMatches", () => {
  it("matches only the same code, whatever the lengths", () => {
    expect(accessCodeMatches("judges-only-code-123", "judges-only-code-123")).toBe(true);
    expect(accessCodeMatches(" judges-only-code-123 ", "judges-only-code-123")).toBe(true);
    expect(accessCodeMatches("judges-only-code-12", "judges-only-code-123")).toBe(false);
    expect(accessCodeMatches("judges-only-code-1234", "judges-only-code-123")).toBe(false);
    expect(accessCodeMatches("JUDGES-ONLY-CODE-123", "judges-only-code-123")).toBe(false);
    expect(accessCodeMatches("", "judges-only-code-123")).toBe(false);
  });
});
