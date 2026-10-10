import type { ServerEnv } from "./env-schema";

// Decides whose keys pay for a run. A BYOK run uses only the visitor's keys and
// never falls back to the owner's; the owner path is a separate, explicit mode
// behind the trial and live-run switches. Budget checks happen after this.

export type RunRequest =
  | { mode: "byok"; nebiusApiKey?: string; tavilyApiKey?: string }
  | { mode: "trial" };

export type RunKeys = {
  source: "byok" | "owner";
  nebiusApiKey: string;
  tavilyApiKey: string;
};

export type RunKeysResult =
  | { ok: true; keys: RunKeys }
  | { ok: false; reason: "byok_incomplete" | "trial_disabled" | "owner_keys_missing" };

export function resolveRunKeys(request: RunRequest, env: ServerEnv): RunKeysResult {
  if (request.mode === "byok") {
    const nebiusApiKey = request.nebiusApiKey?.trim() ?? "";
    const tavilyApiKey = request.tavilyApiKey?.trim() ?? "";
    if (!nebiusApiKey || !tavilyApiKey) return { ok: false, reason: "byok_incomplete" };
    return { ok: true, keys: { source: "byok", nebiusApiKey, tavilyApiKey } };
  }

  if (!env.LIVE_RUNS_ENABLED || !env.TRIAL_RUNS_ENABLED) return { ok: false, reason: "trial_disabled" };
  if (!env.NEBIUS_API_KEY || !env.TAVILY_API_KEY) return { ok: false, reason: "owner_keys_missing" };
  return {
    ok: true,
    keys: { source: "owner", nebiusApiKey: env.NEBIUS_API_KEY, tavilyApiKey: env.TAVILY_API_KEY },
  };
}
