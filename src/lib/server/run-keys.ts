import { createHash, timingSafeEqual } from "node:crypto";

import type { ServerEnv } from "./env-schema";

// Decides whose keys pay for a run. A BYOK run uses only the visitor's keys and
// never falls back to the owner's; the owner path is a separate, explicit mode
// behind the trial and live-run switches. When an access code is set, the
// handler counts the attempt and then checks the code; budget checks come after.

export type RunRequest =
  | { mode: "byok"; nebiusApiKey?: string; tavilyApiKey?: string }
  | { mode: "trial"; accessCode?: string };

export type RunKeys = {
  source: "byok" | "owner";
  nebiusApiKey: string;
  tavilyApiKey: string;
  // Whether the run needs the access code checked before it starts. Only true
  // for a trial run while TRIAL_ACCESS_CODE is set.
  withCode: boolean;
};

export type RunKeysResult =
  | { ok: true; keys: RunKeys }
  | { ok: false; reason: "byok_incomplete" | "trial_disabled" | "owner_keys_missing" };

// Both sides are hashed first, so the comparison takes the same time whatever
// was sent, its length included. The handler calls this only once the attempt
// has been counted.
const digest = (value: string) => createHash("sha256").update(value).digest();
export const accessCodeMatches = (sent: string, expected: string): boolean =>
  timingSafeEqual(digest(sent.trim()), digest(expected.trim()));

export function resolveRunKeys(request: RunRequest, env: ServerEnv): RunKeysResult {
  if (request.mode === "byok") {
    const nebiusApiKey = request.nebiusApiKey?.trim() ?? "";
    const tavilyApiKey = request.tavilyApiKey?.trim() ?? "";
    if (!nebiusApiKey || !tavilyApiKey) return { ok: false, reason: "byok_incomplete" };
    return { ok: true, keys: { source: "byok", nebiusApiKey, tavilyApiKey, withCode: false } };
  }

  if (!env.LIVE_RUNS_ENABLED || !env.TRIAL_RUNS_ENABLED) return { ok: false, reason: "trial_disabled" };
  if (!env.NEBIUS_API_KEY || !env.TAVILY_API_KEY) return { ok: false, reason: "owner_keys_missing" };
  return {
    ok: true,
    keys: {
      source: "owner",
      nebiusApiKey: env.NEBIUS_API_KEY,
      tavilyApiKey: env.TAVILY_API_KEY,
      withCode: Boolean(env.TRIAL_ACCESS_CODE),
    },
  };
}
