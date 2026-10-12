import "server-only";

import { redactSecrets } from "./safe-error";

// Calls a Postgres function from supabase/migrations/ through Supabase's REST API
// (POST /rest/v1/rpc/<name>), with the secret key, from the server only. Counts
// that every server instance shares go through these functions, so each count
// is one statement in the database instead of a read and then a write.

export type SupabaseRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

// A run waits on these before it starts, so they get less time than a save.
const TIMEOUT_MS = 5_000;

export function createSupabaseRpc({
  url,
  secretKey,
  fetch: fetchImpl = fetch,
}: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
}): SupabaseRpc {
  const base = new URL("rest/v1/rpc/", url.endsWith("/") ? url : `${url}/`);

  return async (name, args) => {
    // As in run-store.ts: the secret key goes in the apikey header only.
    const res = await fetchImpl(new URL(name, base), {
      method: "POST",
      headers: { apikey: secretKey, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) throw new Error(`${name} failed with ${res.status}: ${redactSecrets(text, [secretKey]).slice(0, 200)}`);
    // A function that returns nothing gives an empty body.
    return text ? (JSON.parse(text) as unknown) : null;
  };
}
