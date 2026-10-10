import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { RunEvent } from "../../agent/events";
import { isRunId } from "../run-id";
import type { ServerEnv } from "./env-schema";
import { redactSecrets } from "./safe-error";

// Saved runs, in the Supabase table from supabase/migrations/, so each run gets
// a public link. A run is saved as its events: the quote, the snippets found and
// the verdict, never keys or page text, which events don't hold. The calls go
// straight to Supabase's REST API with the secret key, from the server only.

export type RunKeys = "own" | "trial";

export type SavedRun = { createdAt: string; events: unknown[] };

export type RunStore = {
  save: (run: { id: string; keys: RunKeys; events: readonly RunEvent[] }) => Promise<void>;
  // null when there is no run with that id.
  load: (id: string) => Promise<SavedRun | null>;
};

const TIMEOUT_MS = 10_000;

const rowsSchema = z.array(z.object({ created_at: z.string(), events: z.array(z.unknown()) }));

export const newRunId = (): string => randomBytes(8).toString("base64url");

export function createRunStore({
  url,
  secretKey,
  fetch: fetchImpl = fetch,
}: {
  url: string;
  secretKey: string;
  fetch?: typeof fetch;
}): RunStore {
  const endpoint = new URL("rest/v1/runs", url.endsWith("/") ? url : `${url}/`);
  // A secret key goes in the apikey header only. Sent as a Bearer token too,
  // Supabase reads it as a JWT and rejects the request.
  const headers = { apikey: secretKey, "Content-Type": "application/json" };

  // Supabase's error text is logged, so the key is taken out of it first.
  const fail = async (what: string, res: Response): Promise<never> => {
    const text = await res.text().catch(() => "");
    throw new Error(`${what} failed with ${res.status}: ${redactSecrets(text, [secretKey]).slice(0, 200)}`);
  };

  return {
    async save({ id, keys, events }) {
      if (!isRunId(id)) throw new Error("not a run id");
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ id, keys, events }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) await fail("saving a run", res);
    },

    async load(id) {
      // The id goes into the filter below, so anything else is turned away here.
      if (!isRunId(id)) return null;
      const query = new URL(endpoint);
      query.searchParams.set("id", `eq.${id}`);
      query.searchParams.set("select", "created_at,events");
      query.searchParams.set("limit", "1");
      const res = await fetchImpl(query, { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) await fail("loading a run", res);
      const row = rowsSchema.parse(await res.json())[0];
      return row ? { createdAt: row.created_at, events: row.events } : null;
    },
  };
}

// null when saving isn't set up, so runs go unsaved and the app works as before.
export function runStoreFromEnv(env: ServerEnv): RunStore | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return createRunStore({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY });
}
