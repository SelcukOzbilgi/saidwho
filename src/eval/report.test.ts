import { describe, expect, it } from "vitest";

import type { EvalCase } from "./cases";
import { renderResults } from "./report";
import type { RunScore } from "./score";

const CASE = (id: string, date: string | null): EvalCase => ({
  id,
  quote: "A saying.",
  language: "en",
  popular_attribution: "Someone Famous",
  verdict: "misattributed",
  earliest: { author: null, work: "A newspaper", date, wording: null },
  misattribution_first_seen: null,
  references: ["https://example.org/"],
  notes: "A note.",
});
const SCORE: RunScore = {
  caseId: "one",
  expected: "misattributed",
  verdict: "misattributed",
  verdictRight: true,
  earliestDate: "1981",
  earliest: "match",
  unsupported: false,
  nebiusUsd: 0.004,
  tavilyCredits: 6,
  unknownCostCalls: 0,
  seconds: 40,
};

describe("renderResults", () => {
  const cases = [CASE("one", "1981-10-11"), CASE("two", "1974"), CASE("three", null)];
  const markdown = renderResults(cases, [
    {
      label: "Cascade",
      scores: [
        SCORE,
        { ...SCORE, caseId: "two", verdict: "correct", verdictRight: false, earliestDate: "1960", earliest: "older" },
        { ...SCORE, caseId: "three", verdict: null, verdictRight: false, earliestDate: null, earliest: null },
      ],
    },
    { label: "All Ultra", scores: [{ ...SCORE, nebiusUsd: 0.05, seconds: 90 }] },
  ]);
  const line = (start: string) => markdown.split("\n").find((l) => l.startsWith(start));

  it("sums each setup's runs", () => {
    expect(line("| Verdict right")).toBe("| Verdict right | 1 of 3 | 1 of 1 |");
    expect(line("| Earliest year")).toBe("| Earliest year within 2 years of the known one | 1 of 2 | 1 of 1 |");
    expect(line("| Earlier than")).toBe("| Earlier than the known date (checked by hand) | 1 | 0 |");
    expect(line("| Nebius cost per quote")).toBe("| Nebius cost per quote | $0.0040 | $0.0500 |");
    expect(line("| Time per quote")).toBe("| Time per quote | 40s | 90s |");
  });

  it("gives each quote its known answer and what each setup said", () => {
    expect(line("| one")).toBe("| one | misattributed, 1981 | misattributed ✓, 1981 ✓ | misattributed ✓, 1981 ✓ |");
    expect(line("| two")).toBe("| two | misattributed, 1974 | correct ✗, 1960 (older) | not run |");
    expect(line("| three")).toBe("| three | misattributed, no date | no verdict ✗ | not run |");
  });
});
