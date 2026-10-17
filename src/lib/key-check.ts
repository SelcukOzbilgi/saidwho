// The browser's side of POST /api/keys/check: what each key field shows, and
// the call that finds out. Anything short of a clear answer from the server,
// a refused check included, reads as "unknown", which never blocks a run.

export type KeyName = "nebius" | "tavily";

export type KeyStatus =
  | { state: "idle" }
  | { state: "checking" }
  // creditsLeft is null when Tavily set no limit or didn't say; Nebius has none.
  | { state: "works"; creditsLeft: number | null }
  | { state: "rejected" }
  | { state: "unknown" };

export const IDLE: KeyStatus = { state: "idle" };

// A little over the server's own five seconds a provider, so its answer wins.
export const CHECK_TIMEOUT_MS = 7_000;

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
export async function checkKeys(
  keys: Partial<Record<KeyName, string>>,
  { fetch: send = fetch, timeoutMs = CHECK_TIMEOUT_MS }: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<Partial<Record<KeyName, KeyStatus>>> {
  const names = (Object.keys(keys) as KeyName[]).filter((name) => keys[name]);
  const unknown = Object.fromEntries(names.map((name) => [name, { state: "unknown" } as KeyStatus]));
  if (names.length === 0) return {};
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
    return Object.fromEntries(names.map((name) => [name, readStatus((json as Record<string, unknown>)[name])]));
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
