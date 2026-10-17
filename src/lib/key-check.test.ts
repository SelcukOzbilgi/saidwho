import { describe, expect, it, vi } from "vitest";

import { checkKeys, keyTail } from "./key-check";

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("checkKeys", () => {
  it("sends only the keys given and reads each answer", async () => {
    const send = reply({ nebius: { state: "works" }, tavily: { state: "works", creditsLeft: 812 } });
    const result = await checkKeys({ nebius: "a-key", tavily: "b-key" }, { fetch: send as unknown as typeof fetch });
    expect(result).toEqual({ nebius: { state: "works", creditsLeft: null }, tavily: { state: "works", creditsLeft: 812 } });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/keys/check");
    expect(JSON.parse(init.body as string)).toEqual({ nebiusApiKey: "a-key", tavilyApiKey: "b-key" });
  });

  it("reads anything short of a clear answer as unknown, never rejected", async () => {
    for (const send of [
      reply({ error: "too_many_checks" }, 429),
      reply({ error: "limits_unavailable" }, 503),
      reply({ nebius: { state: "maybe" } }),
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
      vi.fn(async () => new Response("<html>", { status: 200 })),
    ]) {
      expect(await checkKeys({ nebius: "a-key" }, { fetch: send as unknown as typeof fetch })).toEqual({ nebius: { state: "unknown" } });
    }
  });

  it("passes a rejection through", async () => {
    const send = reply({ tavily: { state: "rejected" } });
    expect(await checkKeys({ tavily: "b-key" }, { fetch: send as unknown as typeof fetch })).toEqual({ tavily: { state: "rejected" } });
  });

  it("asks nothing when there is no key", async () => {
    const send = vi.fn();
    expect(await checkKeys({ nebius: "" }, { fetch: send as unknown as typeof fetch })).toEqual({});
    expect(send).not.toHaveBeenCalled();
  });
});

describe("keyTail", () => {
  it("shows the last four characters of a long key and nothing of a short one", () => {
    expect(keyTail("  abcdefghijklmnop4f2a ")).toBe("4f2a");
    expect(keyTail("short-key")).toBeNull();
  });
});
