import type { RunEvent } from "../agent/events";
import { cleanDate } from "../agent/schemas";
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
  // When the verdict says the saying first appeared. The judge writes dates
  // loosely ("circa 1981"), so this is cleaned to YYYY, YYYY-MM or YYYY-MM-DD,
  // and is null when it holds no year.
  earliestDate: string | null;
  // null when the case has no known date to compare with.
  earliest: EarliestScore | null;
  // The standing verdict cites evidence that was never verified.
  unsupported: boolean;
  // The run hit the spending cap, so it stopped before it was done.
  capped: boolean;
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
  const runDate = cleanDate(last?.verdict.earliest_date ?? null);

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
    capped: events.some((e) => e.type === "budget_exceeded"),
    nebiusUsd: done?.type === "done" ? done.nebiusUsd : 0,
    tavilyCredits: done?.type === "done" ? done.tavilyCredits : 0,
    unknownCostCalls: done?.type === "done" ? done.unknownCostCalls : 0,
    seconds: done?.type === "done" ? done.seconds : 0,
  };
}

// Provider errors that say nothing about the models and could go away on
// another try. Running out of tokens or giving bad output is the model's doing,
// and a rejected request would fail the same way again, so those are scored.
const PASSING_TROUBLE = new Set(["rate_limit", "timeout", "upstream", "network", "unknown"]);
// Errors every later run would hit too: a rejected key, no credits, a missing model.
const LASTING_TROUBLE = new Set(["auth", "quota", "not_found"]);

export type ProviderTrouble = { kinds: string[]; lasting: boolean };

// The provider errors a run hit, by kind. A run that hit a lasting one, or a
// passing one and gave no verdict, shows the provider's state rather than the
// setup's, so the eval doesn't score it.
export function providerTrouble(events: readonly RunEvent[]): ProviderTrouble {
  const kinds = new Set<string>();
  for (const e of events) {
    const failed =
      e.type === "search_failed" ||
      e.type === "plan_failed" ||
      e.type === "trace_failed" ||
      e.type === "judge_failed" ||
      (e.type === "page_read" && e.outcome === "failed");
    // Model calls give "kind: message"; searches give the kind alone.
    const kind = failed && e.reason ? e.reason.split(":")[0] : null;
    if (kind && (PASSING_TROUBLE.has(kind) || LASTING_TROUBLE.has(kind))) kinds.add(kind);
  }
  return { kinds: [...kinds], lasting: [...kinds].some((kind) => LASTING_TROUBLE.has(kind)) };
}

export function worthScoring(events: readonly RunEvent[]): boolean {
  const trouble = providerTrouble(events);
  return !trouble.lasting && (trouble.kinds.length === 0 || events.some((e) => e.type === "verdict"));
}

export type Summary = {
  runs: number;
  verdictsRight: number;
  // Runs whose case has a known date, and how those dates came out.
  dated: number;
  earliest: Record<EarliestScore, number>;
  unsupported: number;
  capped: number;
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
    capped: scores.filter((s) => s.capped).length,
    nebiusUsd: sum((s) => s.nebiusUsd),
    tavilyCredits: sum((s) => s.tavilyCredits),
    unknownCostCalls: sum((s) => s.unknownCostCalls),
    seconds: sum((s) => s.seconds),
  };
}
