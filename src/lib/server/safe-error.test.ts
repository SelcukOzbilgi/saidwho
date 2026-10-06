import { describe, expect, it } from "vitest";

import { redactSecrets, toSafeError } from "./safe-error";

const KEY = "tvly-dev-AbCdEf0123456789XyZ"; // gitleaks:allow (fake fixture)

describe("redactSecrets", () => {
  it("removes known secrets and token-shaped strings", () => {
    const text = `bad key ${KEY}; Authorization: Bearer abc.def-123; other sk-proj-0123456789abcdef`;
    const out = redactSecrets(text, [KEY]);
    expect(out).not.toContain(KEY);
    expect(out).not.toContain("abc.def-123");
    expect(out).not.toContain("sk-proj-0123456789abcdef");
  });

  it("keeps model ids readable", () => {
    expect(redactSecrets("model nvidia/nemotron-3-super-120b-a12b not found")).toContain(
      "nvidia/nemotron-3-super-120b-a12b",
    );
  });
});

describe("toSafeError", () => {
  it("maps an OpenAI-style 401 to auth with no detail", () => {
    const err = Object.assign(new Error(`401 Incorrect API key provided: ${KEY}`), { status: 401 });
    const safe = toSafeError("nebius", err, [KEY]);
    expect(safe).toEqual({
      provider: "nebius",
      kind: "auth",
      status: 401,
      message: "The API key was rejected.",
    });
  });

  it("reads the status from Tavily's plain Error message", () => {
    const safe = toSafeError("tavily", new Error('429 Error: {"detail":"slow down"}'));
    expect(safe.kind).toBe("rate_limit");
    expect(safe.status).toBe(429);
  });

  it("classifies Tavily auth messages without a status", () => {
    expect(toSafeError("tavily", new Error("Unauthorized: missing or invalid API key.")).kind).toBe("auth");
  });

  it("keeps a redacted detail for bad requests", () => {
    const err = Object.assign(new Error(`response_format json_schema is not supported (key ${KEY})`), {
      status: 400,
    });
    const safe = toSafeError("nebius", err, [KEY]);
    expect(safe.kind).toBe("bad_request");
    expect(safe.detail).toContain("json_schema is not supported");
    expect(safe.detail).not.toContain(KEY);
  });

  it("never serializes request config or headers", () => {
    const err = Object.assign(new Error("boom"), {
      status: 500,
      config: { headers: { Authorization: `Bearer ${KEY}` } },
    });
    expect(JSON.stringify(toSafeError("tavily", err, [KEY]))).not.toContain(KEY);
  });

  it("handles non-Error throws", () => {
    expect(toSafeError("nebius", "weird").kind).toBe("unknown");
  });

  it("maps credit and plan-limit statuses to quota", () => {
    for (const status of [402, 432, 433]) {
      const err = Object.assign(new Error("limit"), { status });
      expect(toSafeError("tavily", err).kind).toBe("quota");
    }
  });

  it("does not treat a 400 mentioning timeout as a timeout", () => {
    const err = Object.assign(new Error("invalid timeout parameter"), { status: 400 });
    expect(toSafeError("nebius", err).kind).toBe("bad_request");
  });
});

describe("redactSecrets with masked keys", () => {
  it("removes the visible head and tail of a masked key", () => {
    const out = redactSecrets("Invalid key tvly-dev****Z0123x", ["tvly-dev-AbCdEf0123456789Z0123x"]); // gitleaks:allow (fake fixture)
    expect(out).not.toContain("tvly-dev");
    expect(out).not.toContain("Z0123x");
  });
});
