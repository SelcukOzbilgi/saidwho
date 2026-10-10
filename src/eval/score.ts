import type { RunEvent } from "../agent/events";
import type { EvalCase, Verdict } from "./cases";

// Scores one finished run against the known answer in eval/quotes.jsonl.

// How far the run's earliest year may be from the known one and still count.
// Sources often disagree by a year or two on when a book or speech came out.
export const YEAR_TOLERANCE = 2;

// match: within YEAR_TOLERANCE of the known date. older: earlier than that, which
// is either a find or a misread date, so it is counted apart and checked by hand.
// later: the run stopped short of the known origin. missing: the run gave no date.
export type EarliestScore = "match" | "older" | "later" | "missing";

export type RunScore = {
  caseId: string;
  expected: Verdict;
  // The verdict that stands (the last one), or null when the run gave none.
  verdict: Verdict | null;
  verdictRight: boolean;
  // When the verdict says the saying first appeared, as it gave it.
  earliestDate: string | null;
  // null when the case has no known date to compare with.
  earliest: EarliestScore | null;
  // The standing verdict cites evidence that was never verified.
  unsupported: boolean;
  nebiusUsd: number;
  tavilyCredits: number;
  unknownCostCalls: number;
  seconds: number;
};

const yearOf = (date: string): number => Number(date.slice(0, 4));

export function scoreRun(evalCase: EvalCase, events: readonly RunEvent[]): RunScore {
  const verdicts = events.flatMap((e) => (e.type === "verdict" ? [e] : []));
  const last = verdicts.at(-1);
  const done = events.findLast((e) => e.type === "done");
  const knownDate = evalCase.earliest.date;
  const runDate = last?.verdict.earliest_date ?? null;

  let earliest: EarliestScore | null = null;
  if (knownDate !== null) {
    const gap = runDate === null ? null : yearOf(runDate) - yearOf(knownDate);
    earliest = gap === null ? "missing" : Math.abs(gap) <= YEAR_TOLERANCE ? "match" : gap < 0 ? "older" : "later";
  }

  return {
    caseId: evalCase.id,
    expected: evalCase.verdict,
    verdict: last?.verdict.verdict ?? null,
    verdictRight: last?.verdict.verdict === evalCase.verdict,
    earliestDate: runDate,
    earliest,
    unsupported: (last?.unknownIds.length ?? 0) > 0,
    nebiusUsd: done?.type === "done" ? done.nebiusUsd : 0,
    tavilyCredits: done?.type === "done" ? done.tavilyCredits : 0,
    unknownCostCalls: done?.type === "done" ? done.unknownCostCalls : 0,
    seconds: done?.type === "done" ? done.seconds : 0,
  };
}

export type Summary = {
  runs: number;
  verdictsRight: number;
  // Runs whose case has a known date, and how those dates came out.
  dated: number;
  earliest: Record<EarliestScore, number>;
  unsupported: number;
  nebiusUsd: number;
  tavilyCredits: number;
  unknownCostCalls: number;
  seconds: number;
};

export function summarize(scores: readonly RunScore[]): Summary {
  const earliest: Record<EarliestScore, number> = { match: 0, older: 0, later: 0, missing: 0 };
  for (const s of scores) if (s.earliest) earliest[s.earliest]++;
  const sum = (pick: (s: RunScore) => number) => scores.reduce((total, s) => total + pick(s), 0);
  return {
    runs: scores.length,
    verdictsRight: scores.filter((s) => s.verdictRight).length,
    dated: scores.filter((s) => s.earliest !== null).length,
    earliest,
    unsupported: scores.filter((s) => s.unsupported).length,
    nebiusUsd: sum((s) => s.nebiusUsd),
    tavilyCredits: sum((s) => s.tavilyCredits),
    unknownCostCalls: sum((s) => s.unknownCostCalls),
    seconds: sum((s) => s.seconds),
  };
}
