import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseEvalCases } from "../eval/cases";
import { CASES } from "./cases";

const evalCases = parseEvalCases(readFileSync(new URL("../../eval/quotes.jsonl", import.meta.url), "utf8"));

describe("example cases", () => {
  it("lists each case once", () => {
    const ids = CASES.map((c) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CASES.map((c) => [c.caseId, c] as const))("%s is a finished run of its test-set quote", (id, example) => {
    const known = evalCases.find((c) => c.id === id);
    expect(known).toBeDefined();
    expect(example.run.quote).toBe(known?.quote);
    expect(example.run.popularAttribution).toBe(known?.popular_attribution);
    expect(example.run.finished).toBe(true);
    expect(example.run.stopped).toBeNull();
    // Answer sites stayed out of the search, as in the test set.
    const started = example.events.find((e) => e.type === "started");
    expect(started?.excludeDomains).toEqual(expect.arrayContaining(["quoteinvestigator.com", "wikiquote.org", "wikipedia.org"]));
  });
});
