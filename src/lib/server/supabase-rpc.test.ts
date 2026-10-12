import { describe, expect, it, vi } from "vitest";

import { createSupabaseRpc } from "./supabase-rpc";

const URL_BASE = "https://project.supabase.co";
const SECRET = "sb_secret_fake-for-tests-only"; // gitleaks:allow

function fakeFetch(reply: () => Response) {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    seen.push({ url: String(input), init });
    return reply();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, seen };
}

describe("supabase rpc", () => {
  it("posts the arguments to the function, with the secret key in the apikey header only", async () => {
    const { fetch, seen } = fakeFetch(() => Response.json(true));
    const rpc = createSupabaseRpc({ url: `${URL_BASE}/`, secretKey: SECRET, fetch });
    expect(await rpc("hit_rate_limit", { p_key: "k", p_max: 3 })).toBe(true);
    expect(seen[0].url).toBe("https://project.supabase.co/rest/v1/rpc/hit_rate_limit");
    expect(seen[0].init.method).toBe("POST");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers.apikey).toBe(SECRET);
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ p_key: "k", p_max: 3 });
  });

  it("gives null for a function that returns nothing", async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await createSupabaseRpc({ url: URL_BASE, secretKey: SECRET, fetch })("settle_trial_budget", {})).toBeNull();
  });

  it("gives up after its timeout", async () => {
    const fetch = vi.fn(
      (_input: string | URL | Request, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    ) as unknown as typeof globalThis.fetch;
    const rpc = createSupabaseRpc({ url: URL_BASE, secretKey: SECRET, fetch, timeoutMs: 10 });
    await expect(rpc("hit_rate_limit", {})).rejects.toThrow(/timeout|abort/i);
  });

  it("throws on an error reply, with the key taken out of Supabase's message", async () => {
    const { fetch } = fakeFetch(() => new Response(`bad key ${SECRET}`, { status: 401 }));
    const error = await createSupabaseRpc({ url: URL_BASE, secretKey: SECRET, fetch })("hit_rate_limit", {}).catch(
      (err: Error) => err,
    );
    expect((error as Error).message).toContain("hit_rate_limit failed with 401");
    expect((error as Error).message).not.toContain(SECRET);
  });
});
