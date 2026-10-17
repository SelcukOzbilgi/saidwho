import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "./env-schema";
import { createKeysCheckHandler, creditsLeft, KEY_CHECKS_PER_IP_PER_HOUR, TAVILY_USAGE_URL } from "./keys-check-handler";
import { createMemoryLimiter, type RateLimiter } from "./rate-limit";

const NEBIUS_KEY = "fake-nebius-key-0123456789abcdef";
const TAVILY_KEY = "fake-visitor-tavily-key-4f2a";

// What each provider answers, by host. A function can throw, as fetch does on a
// timeout or a dropped connection.
type Answer = Response | (() => Response | Promise<Response>);

function setup({
  nebius = () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  tavily = () => Response.json({ key: { usage: 188, limit: 1000 }, account: { plan_usage: 400, plan_limit: 4000 } }),
  limiter = createMemoryLimiter(),
  envVars = {},
}: { nebius?: Answer; tavily?: Answer; limiter?: RateLimiter; envVars?: Record<string, string> } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const answer = url.startsWith("https://api.tokenfactory.nebius.com/") ? nebius : tavily;
    return typeof answer === "function" ? answer() : answer;
  });
  const logError = vi.fn();
  const handler = createKeysCheckHandler({
    env: parseServerEnv(envVars),
    limiter,
    fetch: fetchMock as unknown as typeof fetch,
    logError,
    timeoutMs: 50,
  });
  return { handler, calls, logError };
}

const post = (json: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/keys/check", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof json === "string" ? json : JSON.stringify(json),
  });

const both = { nebiusApiKey: NEBIUS_KEY, tavilyApiKey: TAVILY_KEY };

// Every reply and every log line, checked for any part of either key.
const leaks: string[] = [];
async function read(response: Response, logError: ReturnType<typeof vi.fn>) {
  const text = await response.text();
  leaks.push(text, JSON.stringify([...response.headers]), ...logError.mock.calls.map((c) => String(c[0])));
  return JSON.parse(text) as Record<string, unknown>;
}

afterEach(() => {
  for (const text of leaks) {
    for (const key of [NEBIUS_KEY, TAVILY_KEY]) {
      expect(text).not.toContain(key);
      expect(text).not.toContain(key.slice(-6));
    }
  }
  leaks.length = 0;
});

describe("POST /api/keys/check", () => {
  it("says both keys work, with Tavily's credits left, and caches nothing", async () => {
    const { handler, calls, logError } = setup();
    const response = await handler(post(both));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await read(response, logError)).toEqual({ nebius: { state: "works" }, tavily: { state: "works", creditsLeft: 812 } });

    const nebius = calls.find((c) => c.url.includes("nebius"))!;
    expect(nebius.url).toBe("https://api.tokenfactory.nebius.com/v1/models");
    expect(calls.find((c) => c.url === TAVILY_USAGE_URL)).toBeDefined();
    for (const call of calls) {
      expect(call.init.method).toBe("GET");
      expect(call.init.redirect).toBe("error");
      expect(call.init.cache).toBe("no-store");
      expect(call.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect((nebius.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${NEBIUS_KEY}`);
  });

  it("calls a key rejected only when the provider says 401 or 403", async () => {
    const { handler, logError } = setup({
      nebius: () => new Response('{"detail":{"error":"Unauthorized"}}', { status: 401 }),
      tavily: () => new Response("{}", { status: 403 }),
    });
    expect(await read(await handler(post(both)), logError)).toEqual({ nebius: { state: "rejected" }, tavily: { state: "rejected" } });
  });

  it.each([
    ["a rate limit", () => new Response("slow down", { status: 429 })],
    ["a provider error", () => new Response("oops", { status: 503 })],
    ["a timeout", () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError"))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
    ["a redirect", () => Promise.reject(new TypeError("unexpected redirect"))],
  ])("says unknown, never rejected, on %s", async (_name, answer) => {
    const { handler, logError } = setup({ nebius: answer, tavily: answer });
    expect(await read(await handler(post(both)), logError)).toEqual({ nebius: { state: "unknown" }, tavily: { state: "unknown" } });
  });

  it("checks only the key it was sent", async () => {
    const { handler, calls, logError } = setup();
    expect(await read(await handler(post({ tavilyApiKey: TAVILY_KEY })), logError)).toEqual({
      tavily: { state: "works", creditsLeft: 812 },
    });
    expect(calls.map((c) => c.url)).toEqual([TAVILY_USAGE_URL]);
  });

  it("still says a Tavily key works when its usage page has an unexpected shape", async () => {
    const { handler, logError } = setup({ tavily: () => new Response("not json", { status: 200 }) });
    expect(await read(await handler(post({ tavilyApiKey: TAVILY_KEY })), logError)).toEqual({
      tavily: { state: "works", creditsLeft: null },
    });
  });

  it("turns the visitor away once they've checked too many keys this hour, asking no provider", async () => {
    const { handler, calls, logError } = setup();
    for (let i = 0; i < KEY_CHECKS_PER_IP_PER_HOUR; i++) expect((await handler(post(both))).status).toBe(200);
    calls.length = 0;
    const response = await handler(post(both));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await read(response, logError)).toEqual({ error: "too_many_checks" });
    expect(calls).toEqual([]);
  });

  it("counts checks apart from runs", async () => {
    const hit = vi.fn<RateLimiter["hit"]>(async () => 0);
    const { handler } = setup({ limiter: { hit, unhit: async () => {} } });
    await handler(post(both));
    expect(hit.mock.calls[0][1]).toMatchObject({ name: "keys", max: KEY_CHECKS_PER_IP_PER_HOUR });
  });

  it("answers nothing when the count can't be made, and logs no key", async () => {
    const { handler, calls, logError } = setup({
      limiter: {
        hit: async () => {
          throw new Error(`database down while counting ${NEBIUS_KEY}`);
        },
        unhit: async () => {},
      },
    });
    const response = await handler(post(both));
    expect(response.status).toBe(503);
    expect(await read(response, logError)).toEqual({ error: "limits_unavailable" });
    expect(logError).toHaveBeenCalledOnce();
    expect(calls).toEqual([]);
  });

  it.each([
    ["no key at all", {}, 400, "invalid_request"],
    ["two blank keys", { nebiusApiKey: " ", tavilyApiKey: "" }, 400, "invalid_request"],
    ["a field it doesn't know", { ...both, accessCode: "guess" }, 400, "invalid_request"],
    ["a key with a space inside", { nebiusApiKey: "two words" }, 400, "invalid_request"],
    ["a key that is too long", { nebiusApiKey: "k".repeat(513) }, 400, "invalid_request"],
    ["broken JSON", "{nope", 400, "invalid_json"],
    ["a body that is too large", { nebiusApiKey: "k".repeat(3_000) }, 413, "body_too_large"],
  ])("refuses %s without asking a provider", async (_name, json, status, error) => {
    const { handler, calls, logError } = setup();
    const response = await handler(post(json));
    expect(response.status).toBe(status);
    expect(await read(response, logError)).toEqual({ error });
    expect(calls).toEqual([]);
  });

  it("refuses a body that isn't JSON", async () => {
    const { handler, logError } = setup();
    const response = await handler(post(both, { "content-type": "text/plain" }));
    expect(response.status).toBe(415);
    expect(await read(response, logError)).toEqual({ error: "expected_json" });
  });
});

describe("creditsLeft", () => {
  it("takes the smaller of what the key and the plan have left", () => {
    expect(creditsLeft({ key: { usage: 10, limit: 100 }, account: { plan_usage: 3950, plan_limit: 4000 } })).toBe(50);
  });
  it("uses the plan when the key has no limit, and null when neither has one", () => {
    expect(creditsLeft({ key: { usage: 10, limit: null }, account: { plan_usage: 1000, plan_limit: 4000 } })).toBe(3000);
    expect(creditsLeft({ key: { usage: 10, limit: null } })).toBeNull();
    expect(creditsLeft(null)).toBeNull();
  });
  it("never goes below zero", () => {
    expect(creditsLeft({ key: { usage: 120, limit: 100 } })).toBe(0);
  });
});
