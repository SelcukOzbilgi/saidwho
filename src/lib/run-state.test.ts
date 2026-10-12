import { describe, expect, it } from "vitest";

import type { EvidenceNode, RunEvent } from "../agent/events";
import type { JudgeOutput } from "../agent/schemas";
import { byDate, initialRunState, reduceRun } from "./run-state";

const run = (events: RunEvent[]) => events.reduce(reduceRun, initialRunState);

const spend = { tier: "lightning" as const, costUsd: 0.001, usageKnown: true, latencyMs: 100 };

const node = (id: string, date: string | null, status: "exact" | "near" | "not_found" = "exact"): EvidenceNode => ({
  id,
  url: `https://example.org/${id}`,
  host: "example.org",
  title: id,
  check: { status, score: status === "not_found" ? 0.2 : 1 },
  reader: {
    contains_quote: true,
    exact_snippet: "a quote",
    attributed_to: null,
    page_date: date,
    cited_source: null,
    cited_source_date: null,
  },
  attributedTo: null,
  pageDate: date,
  citedSourceDate: null,
  date,
});

const verdict = (v: JudgeOutput["verdict"], confidence: JudgeOutput["confidence"] = "medium"): JudgeOutput => ({
  verdict: v,
  earliest_node: "n1",
  earliest_author: null,
  earliest_date: "1981",
  misattribution_node: null,
  confidence,
  rationale: "The 1981 page [n1] has it.",
});

const STARTED: RunEvent = { type: "started", quote: "Q", popularAttribution: "Einstein", language: "en", excludeDomains: [] };

describe("reduceRun", () => {
  it("moves through the phases of a run", () => {
    const planned = run([
      STARTED,
      { type: "planned", ...spend, tier: "super", variants: [], candidateAuthors: [], queries: ["q"] },
    ]);
    expect(planned.phase).toBe("searching");
    const reading = reduceRun(planned, { type: "pages_ready", pages: 3, droppedExcluded: 0 });
    expect(reading.phase).toBe("reading");
    const finished = reduceRun(reading, { type: "done", nebiusUsd: 0.002, tavilyCredits: 1, unknownCostCalls: 0, seconds: 9 });
    expect(finished).toMatchObject({ phase: "reading", finished: true, seconds: 9 });
  });

  it("takes the planner's name for the usual credit only when none was given", () => {
    // Runs saved before the planner named anyone have no foundAttribution at all.
    const older: RunEvent = { type: "planned", ...spend, tier: "super", variants: [], candidateAuthors: [], queries: ["q"] };
    const planned: RunEvent = { ...older, foundAttribution: "Mark Twain" };
    const blank = run([{ ...STARTED, popularAttribution: null }]);
    expect(blank).toMatchObject({ popularAttribution: null, attributionFrom: null });
    const found = reduceRun(blank, planned);
    expect(found).toMatchObject({ popularAttribution: "Mark Twain", attributionFrom: "planner" });
    expect(found.log.at(-1)?.text).toContain("usually credited to Mark Twain");
    expect(run([STARTED, planned])).toMatchObject({ popularAttribution: "Einstein", attributionFrom: "visitor" });
    expect(reduceRun(blank, older)).toMatchObject({ popularAttribution: null, attributionFrom: null });
  });

  it("tracks the Genealogist's rounds without losing its step to the searches", () => {
    const state = run([
      STARTED,
      { type: "pages_ready", pages: 3, droppedExcluded: 0 },
      { type: "traced", ...spend, tier: "super", round: 1, leads: [{ fromNode: "n2", work: "Confessions", query: "Rousseau Confessions" }] },
      { type: "searched", query: "Rousseau Confessions", results: 5, credits: 1, latencyMs: 9 },
      { type: "pages_ready", pages: 2, droppedExcluded: 1, round: 1 },
      { type: "page_read", ...spend, url: "https://c.org/", host: "c.org", outcome: "no_quote", reason: null, lookingFor: "Confessions" },
      { type: "node_added", node: { ...node("n4", "1782"), foundVia: { node: "n2", work: "Confessions" } } },
    ]);
    expect(state).toMatchObject({ phase: "tracing", pages: 5, searches: 0, tavilyCredits: 1, nebiusUsd: 0.002 });
    expect(state.leads).toEqual([{ round: 1, fromNode: "n2", work: "Confessions", query: "Rousseau Confessions" }]);
    expect(state.log.map((entry) => entry.text)).toContain("Following Confessions (cited by n2)");
    expect(state.log.map((entry) => entry.text)).toContain("2 new pages to read, 1 from excluded sites dropped");
    expect(state.log.map((entry) => entry.text)).toContain("No quote on c.org (looking for Confessions)");
    const told = reduceRun(state, {
      type: "cited_works",
      works: [{ citedBy: "n2", work: "Confessions", checked: "Pages found for Confessions on c.org don't have the saying in any wording this run knows." }],
    });
    expect(told.log.at(-1)).toMatchObject({
      agent: "Genealogist",
      text: "Told the Judge: Pages found for Confessions on c.org don't have the saying in any wording this run knows.",
    });
    const failed = reduceRun(state, { type: "trace_failed", ...spend, tier: "super", round: 2, reason: "invalid JSON" });
    expect(failed.log.at(-1)).toMatchObject({ agent: "Genealogist", tone: "bad" });
    expect(reduceRun(failed, { type: "verdict", ...spend, verdict: verdict("misattributed"), unknownIds: [] }).phase).toBe("judging");
  });

  it("keeps the last verdict when a second judge ran", () => {
    const state = run([
      STARTED,
      { type: "verdict", ...spend, tier: "super", verdict: verdict("correct"), unknownIds: ["n9"] },
      { type: "escalated", step: "judge", from: "super", to: "ultra", thinking: true, reason: "cites n9", url: null },
      { type: "verdict", ...spend, tier: "ultra", verdict: verdict("misattributed"), unknownIds: [] },
    ]);
    expect(state.verdict).toMatchObject({ tier: "ultra", output: { verdict: "misattributed" } });
    expect(state.log.find((e) => e.text.startsWith("Set aside"))).toMatchObject({
      agent: "Judge",
      tone: "bad",
      text: "Set aside a verdict (correctly attributed, medium confidence): it cites n9, which were not confirmed",
    });
    expect(state.log.find((e) => e.text.startsWith("Trying again on ultra"))?.tone).toBe("warn");
  });

  it("shows no verdict when the only one cites an unconfirmed page, even after the second judge fails", () => {
    const setAside = run([{ type: "verdict", ...spend, tier: "super", verdict: verdict("contested"), unknownIds: ["n9"] }]);
    expect(setAside.verdict).toBeNull();
    expect(setAside.noVerdict).toBe("the Judge's verdict cited pages that weren't confirmed, so it was set aside");
    const failed = reduceRun(setAside, { type: "judge_failed", ...spend, tier: "ultra", reason: "upstream" });
    expect(failed.verdict).toBeNull();
    expect(failed.noVerdict).toBe("upstream");
  });

  it("logs what the checker changed about the earliest date after the verdict", () => {
    const state = run([
      {
        type: "verdict",
        ...spend,
        verdict: verdict("misattributed"),
        unknownIds: [],
        fixes: ["named n2 as the earliest page instead of n5: n2 gives 1999 and n5 doesn't"],
      },
    ]);
    expect(state.log.slice(-2).map((e) => [e.agent, e.tone, e.text])).toEqual([
      ["Judge", "good", "Verdict: misattributed, medium confidence"],
      ["Checker", "warn", "Named n2 as the earliest page instead of n5: n2 gives 1999 and n5 doesn't"],
    ]);
    expect(state.log.map((e) => e.id)).toEqual(state.log.map((_, i) => i));
  });

  it("says when the judge is asked for a verdict without the lineage", () => {
    const state = run([{ type: "escalated", step: "judge", from: "super", to: "super", thinking: false, reason: "ran out of tokens", url: null, compact: true }]);
    expect(state.log.at(-1)?.text).toBe("Trying again on super with thinking off, without the lineage: ran out of tokens");
  });

  it("doesn't say thinking is off when a judge on the same model tries again with it on", () => {
    const state = run([{ type: "escalated", step: "judge", from: "super", to: "super", thinking: true, reason: "bad_request: schema", url: null }]);
    expect(state.log.at(-1)?.text).toBe("Trying again on super: bad_request: schema");
  });

  it("says why there is no verdict", () => {
    expect(run([{ type: "judge_skipped", reason: "no verified evidence" }]).noVerdict).toBe("no verified evidence");
    expect(run([{ type: "judge_failed", ...spend, reason: "bad output" }]).noVerdict).toBe("bad output");
    expect(run([{ type: "plan_failed", ...spend, reason: "auth: rejected" }]).noVerdict).toBe("Planning failed: auth: rejected");
    const searchedAnyway = run([
      { type: "plan_failed", ...spend, reason: "timeout" },
      { type: "searched", query: "q", results: 1, credits: 1, latencyMs: 1 },
    ]);
    expect(searchedAnyway.noVerdict).toBeNull();
  });

  it("adds up spend as it streams, then takes the server's totals", () => {
    const state = run([
      { type: "page_read", ...spend, url: "https://a.org/", host: "a.org", outcome: "no_quote", reason: null },
      { type: "page_read", ...spend, usageKnown: false, url: "https://b.org/", host: "b.org", outcome: "failed", reason: "upstream" },
      { type: "searched", query: "q", results: 5, credits: 1, latencyMs: 10 },
      { type: "searched", query: "q2", results: 5, credits: null, latencyMs: 10 },
    ]);
    expect(state.nebiusUsd).toBeCloseTo(0.002);
    expect(state.unknownCostCalls).toBe(1);
    expect(state.tavilyCredits).toBe(1);
    expect(state.readUrls).toHaveLength(2);
    const done = reduceRun(state, { type: "done", nebiusUsd: 0.0025, tavilyCredits: 2, unknownCostCalls: 1, seconds: 4 });
    expect(done).toMatchObject({ nebiusUsd: 0.0025, tavilyCredits: 2 });
  });

  it("prices the same calls at Ultra's rates, and drops that for logs without token counts", () => {
    const read = { type: "page_read" as const, ...spend, url: "https://a.org/", host: "a.org", outcome: "no_quote" as const, reason: null };
    const tokens = { promptTokens: 1_000, completionTokens: 100 };
    // 1,000 tokens in at $1/M and 100 out at $3/M. A call with no usage adds nothing.
    expect(run([{ ...read, tokens }, { ...read, usageKnown: false }]).ultraUsd).toBeCloseTo(0.0013);
    expect(run([{ ...read, tokens }, read]).ultraUsd).toBeNull();
  });

  it("counts a page read again once", () => {
    const read = { type: "page_read" as const, ...spend, url: "https://a.org/", host: "a.org", outcome: "evidence" as const, reason: null };
    expect(run([read, read]).readUrls).toEqual(["https://a.org/"]);
  });

  it("keeps crossed-out nodes and marks them in the log", () => {
    const state = run([{ type: "node_added", node: node("n1", "1981", "not_found") }]);
    expect(state.nodes).toHaveLength(1);
    expect(state.log[0]).toMatchObject({ agent: "Checker", tone: "bad" });
  });

  it("records a stop for the budget or an abort", () => {
    expect(run([{ type: "budget_exceeded", spentUsd: 0.1, maxUsd: 0.1 }]).stopped).toBe("budget");
    expect(run([{ type: "aborted" }]).stopped).toBe("aborted");
  });
});

describe("byDate", () => {
  it("puts dated nodes oldest first and undated ones last", () => {
    const sorted = byDate([node("a", null), node("b", "2001"), node("c", "1981-10"), node("d", "1981")]);
    expect(sorted.map((n) => n.id)).toEqual(["d", "c", "b", "a"]);
  });
});
