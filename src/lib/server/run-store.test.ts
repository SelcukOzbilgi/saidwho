import { describe, expect, it, vi } from "vitest";

import type { RunEvent } from "../../agent/events";
import { isRunId } from "../run-id";
import { parseServerEnv } from "./env-schema";
import { createRunStore, newRunId, runStoreFromEnv } from "./run-store";

const URL_BASE = "https://project.supabase.co";
const SECRET = "fake-supabase-secret-for-tests-only";
const EVENTS: RunEvent[] = [{ type: "done", nebiusUsd: 0.004, tavilyCredits: 5, unknownCostCalls: 0, seconds: 30 }];

type Seen = { url: string; init: RequestInit };

function fakeFetch(reply: () => Response) {
  const seen: Seen[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    seen.push({ url: String(input), init });
    return reply();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

describe("run store", () => {
  it("makes ids that pass the shared pattern, and different ones each time", () => {
    const ids = Array.from({ length: 50 }, newRunId);
    expect(ids.every(isRunId)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("saves a run with the secret key in the apikey header only", async () => {
    const { fetch, seen } = fakeFetch(() => new Response(null, { status: 201 }));
    await createRunStore({ url: URL_BASE, secretKey: SECRET, fetch }).save({ id: "abcDEF123_-", keys: "own", events: EVENTS });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://project.supabase.co/rest/v1/runs");
    expect(seen[0].init.method).toBe("POST");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SECRET);
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ id: "abcDEF123_-", keys: "own", events: EVENTS });
    expect(String(seen[0].init.body)).not.toContain(SECRET);
  });

  it("throws on a failed save, with the key taken out of Supabase's message", async () => {
    const { fetch } = fakeFetch(() => new Response(`bad key ${SECRET}`, { status: 401 }));
    const store = createRunStore({ url: URL_BASE, secretKey: SECRET, fetch });
    const error = await store.save({ id: "abcDEF123_-", keys: "trial", events: EVENTS }).catch((err: Error) => err);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("failed with 401");
    expect((error as Error).message).not.toContain(SECRET);
  });

  it("loads a run by id, and gives null when there is none", async () => {
    const row = { created_at: "2026-10-10T12:00:00Z", events: EVENTS };
    const { fetch, seen } = fakeFetch(() => Response.json([row]));
    const store = createRunStore({ url: `${URL_BASE}/`, secretKey: SECRET, fetch });
    expect(await store.load("abcDEF123_-")).toEqual({ createdAt: row.created_at, events: EVENTS });
    const url = new URL(seen[0].url);
    expect(url.pathname).toBe("/rest/v1/runs");
    expect(url.searchParams.get("id")).toBe("eq.abcDEF123_-");
    expect(seen[0].url).not.toContain(SECRET);

    const empty = createRunStore({ url: URL_BASE, secretKey: SECRET, fetch: fakeFetch(() => Response.json([])).fetch });
    expect(await empty.load("abcDEF123_-")).toBeNull();
  });

  it("never sends something that isn't an id into the filter", async () => {
    const { fetch, seen } = fakeFetch(() => Response.json([]));
    const store = createRunStore({ url: URL_BASE, secretKey: SECRET, fetch });
    for (const id of ["abc", "abcDEF123_-x", "abcDEF123_)", "eq.abc&or=(", "../../etc"]) expect(await store.load(id)).toBeNull();
    await expect(store.save({ id: "not an id", keys: "own", events: EVENTS })).rejects.toThrow("not a run id");
    expect(seen).toHaveLength(0);
  });

  it("is off unless both the URL and the secret key are set", () => {
    expect(runStoreFromEnv(parseServerEnv({}))).toBeNull();
    expect(runStoreFromEnv(parseServerEnv({ SUPABASE_URL: URL_BASE }))).toBeNull();
    expect(runStoreFromEnv(parseServerEnv({ SUPABASE_URL: URL_BASE, SUPABASE_SECRET_KEY: SECRET }))).not.toBeNull();
  });
});
