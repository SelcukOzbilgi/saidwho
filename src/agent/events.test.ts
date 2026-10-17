import { describe, expect, it } from "vitest";

import { runEventSchema } from "./events";

const started = { type: "started", quote: "Q", popularAttribution: null, excludeDomains: [] };

describe("the started event", () => {
  it("parses with a language, as every run saved so far has one", () => {
    expect(runEventSchema.parse({ ...started, language: "tr" })).toMatchObject({ language: "tr" });
  });

  it("parses without one, when the visitor wasn't sure", () => {
    expect(runEventSchema.safeParse({ ...started, language: null }).success).toBe(true);
    expect(runEventSchema.safeParse(started).success).toBe(true);
  });
});
