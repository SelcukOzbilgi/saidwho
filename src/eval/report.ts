import type { EvalCase } from "./cases";
import { NOT_RECORDED } from "./fingerprint";
import { type RunScore, summarize, YEAR_TOLERANCE } from "./score";
import type { EvalSet } from "./sets";

// Turns scored runs into a set's results file (eval/results.md for the main set):
// an intro, a summary per setup, then one row per quote.

// code says which commit the runs came from (see describeCode in fingerprint.ts).
export type PolicyRuns = { label: string; code: string; scores: readonly RunScore[] };

// days: the dates the runs were made on, as YYYY-MM-DD, in any order.
export function renderIntro(set: EvalSet, days: readonly string[], setups: readonly { label: string; about: string }[]): string {
  const sorted = [...new Set(days)].sort();
  const when = sorted.length === 0 ? "" : sorted.length === 1 ? ` on ${sorted[0]}` : ` from ${sorted[0]} to ${sorted.at(-1)}`;
  const lines = [
    "# Eval results",
    "",
    ...(set.about ? [set.about, ""] : []),
    `Written by \`pnpm eval\` from runs made${when}. Each quote in [${set.file}](${set.file}) was run with the sites that already wrote up its answer left out: Quote Investigator, Wikiquote, Wikipedia and the pages the answer comes from.`,
    "",
    ...setups.map((p) => `- ${p.label}: ${p.about}`),
    "",
    "Setups that searched for the same query got the same pages, from a shared cache. The Tavily credits are what each setup's searches cost when they were made.",
    "",
    `The Code (commit) row gives the commit each setup's runs came from, with a count when they came from more than one. "-dirty" means src/ had changes that weren't committed, and "${NOT_RECORDED}" means the run was logged before the commit was recorded.`,
    "",
    `A ✓ after a verdict means it matches the known answer, and after a year that it's within ${YEAR_TOLERANCE} years of the known earliest date. A year marked (older) is earlier than the known date. That is either a find or a misread date, so those are checked by hand.`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

const usd = (value: number, digits: number): string => `$${value.toFixed(digits)}`;
const yearOf = (date: string | null): string => date?.slice(0, 4) ?? "no date";
const row = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;

function cell(score: RunScore | undefined): string {
  if (!score) return "not run";
  const capped = score.capped ? " (stopped at the cap)" : "";
  if (score.verdict === null) return `no verdict ✗${capped}`;
  const date =
    score.earliest === "match"
      ? `${yearOf(score.earliestDate)} ✓`
      : score.earliest === "older"
        ? `${yearOf(score.earliestDate)} (older)`
        : score.earliest === "later"
          ? `${yearOf(score.earliestDate)} ✗`
          : yearOf(score.earliestDate);
  return `${score.verdict} ${score.verdictRight ? "✓" : "✗"}, ${date}${capped}`;
}

export function renderResults(cases: readonly EvalCase[], policies: readonly PolicyRuns[]): string {
  const summaries = policies.map((p) => summarize(p.scores));
  const per = (pick: (s: ReturnType<typeof summarize>) => string) => summaries.map(pick);
  const lines = [
    row(["", ...policies.map((p) => p.label)]),
    row(["---", ...policies.map(() => "---")]),
    row(["Quotes run", ...per((s) => String(s.runs))]),
    row(["Code (commit)", ...policies.map((p) => p.code)]),
    row(["Verdict right", ...per((s) => `${s.verdictsRight} of ${s.runs}`)]),
    row([`Earliest year within ${YEAR_TOLERANCE} years of the known one`, ...per((s) => `${s.earliest.match} of ${s.dated}`)]),
    row(["Earlier than the known date (checked by hand)", ...per((s) => String(s.earliest.older))]),
    row(["Later than the known date", ...per((s) => String(s.earliest.later))]),
    row(["No date given", ...per((s) => String(s.earliest.missing))]),
    row(["Last verdict set aside for citing unverified evidence", ...per((s) => String(s.unsupported))]),
    row(["Stopped at the spending cap", ...per((s) => String(s.capped))]),
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
