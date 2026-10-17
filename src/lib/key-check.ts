// The browser's side of POST /api/keys/check: what each key field shows, and
// the call that finds out. A key that can't be one (a space inside it, a
// character no key has, far too long) is told so here, without asking anyone.
// Anything short of a clear answer from the server, a refused check included,
// reads as "unknown", which never blocks a run.

export type KeyName = "nebius" | "tavily";

export type KeyStatus =
  | { state: "idle" }
  | { state: "checking" }
  // creditsLeft is null when Tavily set no limit or didn't say; Nebius has none.
  | { state: "works"; creditsLeft: number | null }
  | { state: "rejected" }
  // Not shaped like a key, so it was never sent; what's wrong with it.
  | { state: "malformed"; problem: KeyProblem }
  | { state: "unknown" };

export type KeyProblem = "space" | "character" | "long";

// The server's rule for a key (apiKey in investigate-request.ts): after
// trimming, up to 512 characters, each one a printable keyboard character.
export function keyProblem(key: string): KeyProblem | null {
  const trimmed = key.trim();
  if (trimmed.length > 512) return "long";
  if (/\s/.test(trimmed)) return "space";
  if (/[^\x21-\x7e]/.test(trimmed)) return "character";
  return null;
}

// A key the run can't start with: refused by its provider, or not a key at all.
export const keyRefused = (status: KeyStatus) => status.state === "rejected" || status.state === "malformed";

export const IDLE: KeyStatus = { state: "idle" };

// Over the server's slowest answer, so its answer wins: up to two seconds to
// count the check (LIMITER_TIMEOUT_MS), then up to five for the providers,
// which are asked side by side, with room for the trip there and back.
export const CHECK_TIMEOUT_MS = 9_000;

const FIELDS: Record<KeyName, "nebiusApiKey" | "tavilyApiKey"> = { nebius: "nebiusApiKey", tavily: "tavilyApiKey" };

function readStatus(value: unknown): KeyStatus {
  if (!value || typeof value !== "object" || !("state" in value)) return { state: "unknown" };
  const { state } = value as { state: unknown };
  if (state === "rejected") return { state };
  if (state === "works") {
    const left = (value as { creditsLeft?: unknown }).creditsLeft;
    return { state, creditsLeft: typeof left === "number" && Number.isFinite(left) ? left : null };
  }
  return { state: "unknown" };
}

// Checks the keys given (trimmed, non-empty) and returns a status for each.
// One that isn't shaped like a key is answered here and not sent.
export async function checkKeys(
  keys: Partial<Record<KeyName, string>>,
  { fetch: send = fetch, timeoutMs = CHECK_TIMEOUT_MS }: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<Partial<Record<KeyName, KeyStatus>>> {
  const given = (Object.keys(keys) as KeyName[]).filter((name) => keys[name]);
  const malformed: Partial<Record<KeyName, KeyStatus>> = {};
  for (const name of given) {
    const problem = keyProblem(keys[name]!);
    if (problem) malformed[name] = { state: "malformed", problem };
  }
  const names = given.filter((name) => !malformed[name]);
  const unknown = { ...malformed, ...Object.fromEntries(names.map((name) => [name, { state: "unknown" } as KeyStatus])) };
  if (names.length === 0) return malformed;
  const body = Object.fromEntries(names.map((name) => [FIELDS[name], keys[name]]));
  try {
    const response = await send("/api/keys/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return unknown;
    const json: unknown = await response.json();
    if (!json || typeof json !== "object") return unknown;
    return { ...malformed, ...Object.fromEntries(names.map((name) => [name, readStatus((json as Record<string, unknown>)[name])])) };
  } catch {
    return unknown;
  }
}

// The last four characters of a key, to tell keys apart once one is checked,
// or null for a key short enough that four characters would be much of it.
export function keyTail(key: string): string | null {
  const trimmed = key.trim();
  return trimmed.length >= 16 ? trimmed.slice(-4) : null;
}
