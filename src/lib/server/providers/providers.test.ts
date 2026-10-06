import { afterEach, describe, expect, it, vi } from "vitest";

const tavilyFactory = vi.hoisted(() => vi.fn(() => ({ search: vi.fn(), extract: vi.fn() })));
vi.mock("@tavily/core", () => ({ tavily: tavilyFactory }));

import { createNebiusClient } from "./nebius";
import { assertAllowedBaseUrl, assertNoSdkEnvOverrides, normalizeApiKey } from "./sdk-guards";
import { createTavilyClient } from "./tavily";

const BASE_URL = "https://api.tokenfactory.nebius.com/v1/";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  tavilyFactory.mockClear();
});

describe("createTavilyClient", () => {
  it("refuses a blank key even when the owner key is in the environment", () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-owner-key-should-never-be-used"); // gitleaks:allow (fake fixture)
    expect(() => createTavilyClient({ apiKey: "" })).toThrow("Tavily API key is required");
    expect(() => createTavilyClient({ apiKey: "   " })).toThrow("Tavily API key is required");
    expect(tavilyFactory).not.toHaveBeenCalled();
  });

  it("passes the trimmed key explicitly to the SDK", () => {
    createTavilyClient({ apiKey: " tvly-visitor-key \n" });
    expect(tavilyFactory).toHaveBeenCalledWith({ apiKey: "tvly-visitor-key" });
  });

  it("refuses to start while SDK env overrides are set", () => {
    vi.stubEnv("TAVILY_HTTPS_PROXY", "http://proxy.example");
    expect(() => createTavilyClient({ apiKey: "tvly-visitor-key" })).toThrow("TAVILY_HTTPS_PROXY");
  });
});

describe("createNebiusClient", () => {
  it("refuses a blank key", () => {
    expect(() => createNebiusClient({ apiKey: " ", baseURL: BASE_URL })).toThrow("Nebius API key is required");
  });

  it("refuses any host other than Token Factory", () => {
    expect(() => createNebiusClient({ apiKey: "k", baseURL: "https://evil.example/v1/" })).toThrow("must be https");
    expect(() => createNebiusClient({ apiKey: "k", baseURL: "http://api.tokenfactory.nebius.com/v1/" })).toThrow(
      "must be https",
    );
  });

  it("sends only the explicit key to Token Factory and ignores OPENAI_* settings", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-should-not-be-used");
    vi.stubEnv("OPENAI_ORG_ID", "org-should-not-be-sent");
    vi.stubEnv("OPENAI_BASE_URL", "https://evil.example/v1/");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = createNebiusClient({ apiKey: "visitor-key", baseURL: BASE_URL });
    await client.listModels();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).hostname).toBe("api.tokenfactory.nebius.com");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer visitor-key");
    expect(headers.get("openai-organization")).toBeNull();
  });

  it("returns a safe error without the key when the provider rejects it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Incorrect API key provided: visitor-secret-key-123456" } }), { // gitleaks:allow (fake fixture)
            status: 401,
          }),
      ),
    );
    const client = createNebiusClient({ apiKey: "visitor-secret-key-123456", baseURL: BASE_URL }); // gitleaks:allow (fake fixture)
    const result = await client.chat({ model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("visitor-secret");
    expect(!result.ok && result.error.kind).toBe("auth");
  });
});

describe("sdk guards", () => {
  it("rejects keys with inner whitespace or control characters", () => {
    expect(() => normalizeApiKey("abc def", "X")).toThrow("invalid characters");
    expect(() => normalizeApiKey("abc\u0000def", "X")).toThrow("invalid characters");
  });

  it("lists every override that is set", () => {
    expect(() => assertNoSdkEnvOverrides({ OPENAI_CUSTOM_HEADERS: "x: y", TAVILY_ORG_ID: "o" })).toThrow(
      "OPENAI_CUSTOM_HEADERS, TAVILY_ORG_ID",
    );
    expect(() => assertNoSdkEnvOverrides({ OPENAI_API_KEY: "pinned in code, harmless" })).not.toThrow();
  });

  it("accepts the Token Factory base URL", () => {
    expect(() => assertAllowedBaseUrl(BASE_URL)).not.toThrow();
  });
});
