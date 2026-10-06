import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env-schema";
import { resolveRunKeys } from "./run-keys";

const ownerEnv = (overrides: Record<string, string> = {}) =>
  parseServerEnv({
    NEBIUS_API_KEY: "owner-nebius",
    TAVILY_API_KEY: "owner-tavily",
    LIVE_RUNS_ENABLED: "true",
    TRIAL_RUNS_ENABLED: "true",
    LANGSMITH_TRACING: "true",
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

  it("uses trimmed visitor keys and disables tracing for BYOK", () => {
    const result = resolveRunKeys({ mode: "byok", nebiusApiKey: " v-neb ", tavilyApiKey: "v-tav\n" }, ownerEnv());
    expect(result).toEqual({
      ok: true,
      keys: { source: "byok", nebiusApiKey: "v-neb", tavilyApiKey: "v-tav", tracingAllowed: false },
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

  it("reports missing owner keys for trial runs", () => {
    expect(resolveRunKeys({ mode: "trial" }, ownerEnv({ TAVILY_API_KEY: "" }))).toEqual({
      ok: false,
      reason: "owner_keys_missing",
    });
  });

  it("uses owner keys for an enabled trial run", () => {
    const result = resolveRunKeys({ mode: "trial" }, ownerEnv());
    expect(result.ok && result.keys.source).toBe("owner");
    expect(result.ok && result.keys.tracingAllowed).toBe(true);
  });
});
