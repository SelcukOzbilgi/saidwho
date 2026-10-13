import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { hostOf } from "../agent/orchestrator";
import { type EvalCase, parseEvalCases } from "./cases";

const file = fileURLToPath(new URL("../../eval/quotes.jsonl", import.meta.url));
const cases = parseEvalCases(readFileSync(file, "utf8"));

describe("eval/quotes.jsonl", () => {
  it("has 20 cases with unique ids", () => {
    expect(cases).toHaveLength(20);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it("includes honest non-answers, not only clear misattributions", () => {
    const verdicts = cases.map((c) => c.verdict);
    expect(verdicts.filter((v) => v === "contested" || v === "no_known_source").length).toBeGreaterThanOrEqual(3);
    expect(verdicts).toContain("correct");
  });

  it("can't be passed by always answering misattributed", () => {
    const misattributed = cases.filter((c) => c.verdict === "misattributed").length;
    expect(misattributed / cases.length).toBeLessThan(0.5);
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

const read = (file: string): EvalCase[] =>
  parseEvalCases(readFileSync(new URL(`../../eval/${file}`, import.meta.url), "utf8"));
const holdout = read("holdout.jsonl");
// Case and punctuation aside, so the same quote typed a little differently is caught too.
const normalize = (quote: string): string => quote.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

describe("eval/holdout.jsonl", () => {
  it("has 10 cases with unique ids", () => {
    expect(holdout).toHaveLength(10);
    expect(new Set(holdout.map((c) => c.id)).size).toBe(holdout.length);
  });

  it("shares no id and no quote with the main set, which the example cases come from", () => {
    const mainIds = new Set(cases.map((c) => c.id));
    const mainQuotes = new Set(cases.map((c) => normalize(c.quote)));
    for (const c of holdout) {
      expect(mainIds.has(c.id), c.id).toBe(false);
      expect(mainQuotes.has(normalize(c.quote)), c.id).toBe(false);
    }
  });

  it("mixes verdicts the way real use does", () => {
    const count = (v: EvalCase["verdict"]) => holdout.filter((c) => c.verdict === v).length;
    expect(count("correct")).toBeGreaterThanOrEqual(3);
    expect(count("misattributed")).toBeGreaterThanOrEqual(4);
    expect(count("contested") + count("no_known_source")).toBeGreaterThanOrEqual(1);
    expect(count("misattributed") / holdout.length).toBeLessThanOrEqual(0.6);
  });

  it("includes quotes outside English", () => {
    expect(holdout.filter((c) => c.language !== "en").length).toBeGreaterThanOrEqual(1);
  });

  it("dates the misattribution no earlier than the first appearance", () => {
    for (const c of holdout) {
      if (c.earliest.date && c.misattribution_first_seen) {
        expect(c.misattribution_first_seen >= c.earliest.date, c.id).toBe(true);
      }
    }
  });

  it("keeps each answer's own pages out of the search, not whole shared sites", () => {
    const hosts = holdout.flatMap((c) => c.references.map(hostOf));
    expect(hosts).not.toContain("invalid-url");
    // Excluding one of these would take a whole library away from the agent.
    for (const broad of ["archive.org", "books.google.com", "doi.org", "jstor.org", "hathitrust.org"]) {
      expect(hosts).not.toContain(broad);
    }
  });
});

describe("parseEvalCases", () => {
  it("names the line of a broken entry", () => {
    expect(() => parseEvalCases('{"id":"x"}\n')).toThrow(/line 1/);
  });

  it("counts blank lines when naming the line", () => {
    expect(() => parseEvalCases('\n{"id":"x"}\n')).toThrow(/line 2/);
  });

  it("rejects dates that don't exist", () => {
    const valid = cases[0];
    const withDate = (date: string) => JSON.stringify({ ...valid, earliest: { ...valid.earliest, date } });
    expect(() => parseEvalCases(withDate("2025-99-99"))).toThrow(/not a real calendar date/);
    expect(() => parseEvalCases(withDate("1981-02-29"))).toThrow(/not a real calendar date/);
    expect(parseEvalCases(withDate("1980-02-29"))).toHaveLength(1);
  });

  it("names the line of malformed JSON", () => {
    expect(() => parseEvalCases('\n{"id":\n')).toThrow(/line 2 is not valid JSON/);
  });
});
