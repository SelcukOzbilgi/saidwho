import type { EvalCase } from "./cases";
import { type RunScore, summarize, YEAR_TOLERANCE } from "./score";

// Turns scored runs into eval/results.md: a summary per setup, then one row per quote.

export type PolicyRuns = { label: string; scores: readonly RunScore[] };

const usd = (value: number, digits: number): string => `$${value.toFixed(digits)}`;
const yearOf = (date: string | null): string => date?.slice(0, 4) ?? "no date";
const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

function cell(score: RunScore | undefined): string {
  if (!score) return "not run";
  if (score.verdict === null) return "no verdict ✗";
  const date =
    score.earliest === "match"
      ? `${yearOf(score.earliestDate)} ✓`
      : score.earliest === "older"
        ? `${yearOf(score.earliestDate)} (older)`
        : score.earliest === "later"
          ? `${yearOf(score.earliestDate)} ✗`
          : yearOf(score.earliestDate);
  return `${score.verdict} ${score.verdictRight ? "✓" : "✗"}, ${date}`;
}

export function renderResults(cases: readonly EvalCase[], policies: readonly PolicyRuns[]): string {
  const summaries = policies.map((p) => summarize(p.scores));
  const per = (pick: (s: ReturnType<typeof summarize>) => string) => summaries.map(pick);
  const lines = [
    row(["", ...policies.map((p) => p.label)]),
    row(["---", ...policies.map(() => "---")]),
    row(["Quotes run", ...per((s) => String(s.runs))]),
    row(["Verdict right", ...per((s) => `${s.verdictsRight} of ${s.runs}`)]),
    row([`Earliest year within ${YEAR_TOLERANCE} years of the known one`, ...per((s) => `${s.earliest.match} of ${s.dated}`)]),
    row(["Earlier than the known date (checked by hand)", ...per((s) => String(s.earliest.older))]),
    row(["Later than the known date", ...per((s) => String(s.earliest.later))]),
    row(["No date given", ...per((s) => String(s.earliest.missing))]),
    row(["Verdict citing unverified evidence", ...per((s) => String(s.unsupported))]),
    row(["Nebius cost, all quotes", ...per((s) => usd(s.nebiusUsd, 4))]),
    row(["Nebius cost per quote", ...per((s) => (s.runs ? usd(s.nebiusUsd / s.runs, 4) : "-"))]),
    row(["Tavily credits", ...per((s) => String(s.tavilyCredits))]),
    row(["Calls with unknown cost", ...per((s) => String(s.unknownCostCalls))]),
    row(["Time per quote", ...per((s) => (s.runs ? `${Math.round(s.seconds / s.runs)}s` : "-"))]),
    "",
    row(["Quote", "Known answer", ...policies.map((p) => p.label)]),
    row(["---", "---", ...policies.map(() => "---")]),
    ...cases.map((c) =>
      row([
        c.id,
        `${c.verdict}, ${yearOf(c.earliest.date)}`,
        ...policies.map((p) => cell(p.scores.find((s) => s.caseId === c.id))),
      ]),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
