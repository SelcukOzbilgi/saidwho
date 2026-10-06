import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseEvalCases } from "./cases";

const file = fileURLToPath(new URL("../../eval/quotes.jsonl", import.meta.url));
const cases = parseEvalCases(readFileSync(file, "utf8"));

describe("eval/quotes.jsonl", () => {
  it("has 15 cases with unique ids", () => {
    expect(cases).toHaveLength(15);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("includes honest non-answers, not only clear misattributions", () => {
    const verdicts = cases.map((c) => c.verdict);
    expect(verdicts.filter((v) => v === "contested" || v === "no_known_source").length).toBeGreaterThanOrEqual(3);
    expect(verdicts).toContain("correct");
  });

  it("includes at least one quote outside English", () => {
    expect(cases.some((c) => c.language !== "en")).toBe(true);
  });

  it("dates the misattribution no earlier than the first appearance", () => {
    for (const c of cases) {
      if (c.earliest.date && c.misattribution_first_seen) {
        expect(c.misattribution_first_seen >= c.earliest.date, c.id).toBe(true);
      }
    }
  });
});

describe("parseEvalCases", () => {
  it("names the line of a broken entry", () => {
    expect(() => parseEvalCases('{"id":"x"}\n')).toThrow(/line 1/);
  });
});
