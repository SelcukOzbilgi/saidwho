import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import type { JudgeOutput } from "../agent/schemas";
import { type EvalCase, parseEvalCases } from "./cases";
import { providerTrouble, scoreRun, summarize, worthScoring } from "./score";

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
    // A verdict citing an unconfirmed page never stands, so the run has none.
    expect(scoreRun(INSANITY, events.slice(0, 1))).toMatchObject({ verdict: null, verdictRight: false, earliest: "missing", unsupported: true });
  });

  it("tells a date older than the known one from a later one and a missing one", () => {
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "1975" }), done]).earliest).toBe("older");
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "1990-11-19" }), done]).earliest).toBe("later");
    expect(scoreRun(INSANITY, [verdict({ earliest_date: null }), done]).earliest).toBe("missing");
  });

  it("reads a loosely written date by its year, and one with no year as missing", () => {
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "circa 1981" }), done])).toMatchObject({ earliestDate: "1981", earliest: "match" });
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "October 11, 1981" }), done]).earliest).toBe("match");
    expect(scoreRun(INSANITY, [verdict({ earliest_date: "unknown" }), done])).toMatchObject({ earliestDate: null, earliest: "missing" });
  });

  it("counts a run with no verdict as wrong, with no date", () => {
    const events: RunEvent[] = [{ type: "judge_skipped", reason: "no verified evidence" }, done];
    expect(scoreRun(INSANITY, events)).toMatchObject({ verdict: null, verdictRight: false, earliest: "missing" });
  });

  it("leaves the date unscored when the case has no known one", () => {
    const score = scoreRun(GEL, [verdict({ verdict: "contested", earliest_date: "1300" }), done]);
    expect(score).toMatchObject({ verdictRight: true, earliest: null });
  });

  it("marks a run that stopped at the spending cap", () => {
    const capped: RunEvent = { type: "budget_exceeded", spentUsd: 0.51, maxUsd: 0.5 };
    expect(scoreRun(INSANITY, [capped, done])).toMatchObject({ verdict: null, verdictRight: false, capped: true });
    expect(scoreRun(INSANITY, [verdict({}), done]).capped).toBe(false);
  });

  it("reports no spend for a run that never finished", () => {
    expect(scoreRun(INSANITY, [verdict({})])).toMatchObject({ nebiusUsd: 0, tavilyCredits: 0, seconds: 0 });
  });
});

describe("providerTrouble", () => {
  const read = (reason: string): RunEvent => ({ type: "page_read", ...spend, url: "https://a.example", host: "a.example", outcome: "failed", reason });

  it("finds provider errors in failed model calls, reads and searches", () => {
    const events: RunEvent[] = [
      { type: "plan_failed", ...spend, reason: "rate_limit: Too many requests; slow down." },
      read("timeout: The provider did not respond in time."),
      { type: "search_failed", query: "q", reason: "upstream" },
    ];
    expect(providerTrouble(events)).toEqual({ kinds: ["rate_limit", "timeout", "upstream"], lasting: false, unrecovered: true });
  });

  it("tells errors every later run would hit from passing ones", () => {
    expect(providerTrouble([{ type: "search_failed", query: "q", reason: "quota" }]).lasting).toBe(true);
    expect(providerTrouble([{ type: "judge_failed", ...spend, reason: "auth: The API key was rejected." }]).lasting).toBe(true);
    expect(providerTrouble([{ type: "plan_failed", ...spend, reason: "bad_request: The provider rejected the request." }]).lasting).toBe(true);
  });

  it("leaves the model's own failures to the score", () => {
    const events: RunEvent[] = [{ type: "judge_failed", ...spend, reason: "ran out of tokens" }, read("output does not match schema: x")];
    expect(providerTrouble(events)).toEqual({ kinds: [], lasting: false, unrecovered: false });
  });

  it("counts a failed plan, read or verdict as made up for when a later try worked", () => {
    const planned: RunEvent = { type: "planned", ...spend, variants: [], candidateAuthors: [], queries: ["q"] };
    const readOk: RunEvent = { type: "page_read", ...spend, url: "https://a.example", host: "a.example", outcome: "no_quote", reason: null };
    const events: RunEvent[] = [
      { type: "plan_failed", ...spend, reason: "timeout: The provider did not respond in time." },
      planned,
      read("upstream: The provider had an internal error."),
      readOk,
      { type: "judge_failed", ...spend, reason: "network: Could not reach the provider." },
      verdict({}),
    ];
    expect(providerTrouble(events)).toMatchObject({ kinds: ["timeout", "upstream", "network"], unrecovered: false });
    // A verdict that a failed second judge should have checked doesn't make up for it.
    expect(providerTrouble([verdict({}), { type: "judge_failed", ...spend, reason: "timeout: x" }]).unrecovered).toBe(true);
  });

  it("doesn't count a failed trace, or a read of another page, as made up for", () => {
    const traced: RunEvent[] = [{ type: "trace_failed", ...spend, round: 1, reason: "upstream: x" }, verdict({})];
    expect(providerTrouble(traced).unrecovered).toBe(true);
    const otherPage: RunEvent = { type: "page_read", ...spend, url: "https://b.example", host: "b.example", outcome: "evidence", reason: null };
    expect(providerTrouble([read("timeout: x"), otherPage, verdict({})]).unrecovered).toBe(true);
  });
});

describe("worthScoring", () => {
  const limited: RunEvent = { type: "plan_failed", ...spend, reason: "rate_limit: Too many requests; slow down." };

  it("skips a run with a provider error it didn't make up for, even one with a verdict", () => {
    expect(worthScoring([limited, done])).toBe(false);
    expect(worthScoring([{ type: "search_failed", query: "q", reason: "rate_limit" }, verdict({}), done])).toBe(false);
    expect(worthScoring([{ type: "judge_skipped", reason: "no verified evidence" }, done])).toBe(true);
    expect(worthScoring([verdict({}), done])).toBe(true);
  });

  it("skips any run with a lasting provider error, even one a later try made up for", () => {
    expect(worthScoring([{ type: "search_failed", query: "q", reason: "quota" }, verdict({}), done])).toBe(false);
    const planned: RunEvent = { type: "planned", ...spend, variants: [], candidateAuthors: [], queries: ["q"] };
    const refused: RunEvent = { type: "plan_failed", ...spend, reason: "bad_request: The provider rejected the request." };
    expect(worthScoring([refused, planned, verdict({}), done])).toBe(false);
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
      earliest: { match: 1, older: 0, later: 0, missing: 1 },
      unsupported: 1,
      capped: 0,
      nebiusUsd: 0.012,
      tavilyCredits: 21,
      unknownCostCalls: 3,
      seconds: 123,
    });
  });
});
