import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import type { JudgeOutput } from "../agent/schemas";
import { type EvalCase, parseEvalCases } from "./cases";
import { scoreRun, summarize } from "./score";

const file = fileURLToPath(new URL("../../eval/quotes.jsonl", import.meta.url));
const cases = parseEvalCases(readFileSync(file, "utf8"));
const caseOf = (id: string): EvalCase => cases.find((c) => c.id === id) as EvalCase;
// Known answer: misattributed, earliest 1981-10-11.
const INSANITY = caseOf("insanity-same-thing");
// Known answer: contested, no known date.
const GEL = caseOf("gel-ne-olursan-ol");

const JUDGED: JudgeOutput = {
  verdict: "misattributed",
  earliest_node: "n1",
  earliest_author: null,
  earliest_date: "1981",
  misattribution_node: null,
  confidence: "medium",
  rationale: "The 1981 newspaper [n1] has it.",
};
const spend = { tier: "super", costUsd: 0.001, usageKnown: true, latencyMs: 5 } as const;
const verdict = (output: Partial<JudgeOutput>, unknownIds: string[] = []): RunEvent => ({
  type: "verdict",
  ...spend,
  verdict: { ...JUDGED, ...output },
  unknownIds,
});
const done: RunEvent = { type: "done", nebiusUsd: 0.004, tavilyCredits: 7, unknownCostCalls: 1, seconds: 41 };

describe("scoreRun", () => {
  it("counts a matching verdict and an earliest year within tolerance", () => {
    const score = scoreRun(INSANITY, [verdict({ earliest_date: "1983-02" }), done]);
    expect(score).toMatchObject({ verdict: "misattributed", verdictRight: true, earliestDate: "1983-02", earliest: "match", unsupported: false });
    expect(score).toMatchObject({ nebiusUsd: 0.004, tavilyCredits: 7, unknownCostCalls: 1, seconds: 41 });
  });

  it("scores the verdict that stands, not the first one", () => {
    const events = [verdict({ verdict: "correct" }, ["n9"]), verdict({ verdict: "misattributed" }), done];
    expect(scoreRun(INSANITY, events)).toMatchObject({ verdict: "misattributed", verdictRight: true, unsupported: false });
    expect(scoreRun(INSANITY, events.slice(0, 1))).toMatchObject({ verdict: "correct", verdictRight: false, unsupported: true });
  });

  it("tells a date older than the known one from a later one and a missing one", () => {
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "1975" }), done]).earliest).toBe("older");
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "1990-11-19" }), done]).earliest).toBe("later");
    expect(scoreRun(INSANITY, [verdict({ earliest_date: null }), done]).earliest).toBe("missing");
  });

  it("counts a run with no verdict as wrong, with no date", () => {
    const events: RunEvent[] = [{ type: "judge_skipped", reason: "no verified evidence" }, done];
    expect(scoreRun(INSANITY, events)).toMatchObject({ verdict: null, verdictRight: false, earliest: "missing" });
  });

  it("leaves the date unscored when the case has no known one", () => {
    const score = scoreRun(GEL, [verdict({ verdict: "contested", earliest_date: "1300" }), done]);
    expect(score).toMatchObject({ verdictRight: true, earliest: null });
  });

  it("reports no spend for a run that never finished", () => {
    expect(scoreRun(INSANITY, [verdict({})])).toMatchObject({ nebiusUsd: 0, tavilyCredits: 0, seconds: 0 });
  });
});

describe("summarize", () => {
  it("adds up verdicts, dates and spend", () => {
    const scores = [
      scoreRun(INSANITY, [verdict({}), done]),
      scoreRun(INSANITY, [verdict({ verdict: "correct", earliest_date: "1975" }, ["n4"]), done]),
      scoreRun(GEL, [verdict({ verdict: "contested" }), done]),
    ];
    expect(summarize(scores)).toEqual({
      runs: 3,
      verdictsRight: 2,
      dated: 2,
      earliest: { match: 1, older: 1, later: 0, missing: 0 },
      unsupported: 1,
      nebiusUsd: 0.012,
      tavilyCredits: 21,
      unknownCostCalls: 3,
      seconds: 123,
    });
  });
});
