import { describe, expect, it } from "vitest";

import type { EvidenceNode, RunEvent } from "../src/agent/events";
import { rebuildEvidence, type SavedRun } from "./saved-runs";

// Saved runs made up for the replay: a search cache in memory, keyed as
// rebuildEvidence asks for it, and the events a run would have logged.

const QUOTE = "Let them eat cake";
const EXACT = `"${QUOTE}"`;
const REQUOTE = `"${QUOTE}" origin first appearance`;
const KEPT = 'Rousseau Confessions "eat cake" brioche';
const LEAD = "Rousseau Confessions full text";
const WORK = "Confessions by Rousseau";

type Result = { url: string; title: string; rawContent: string };
const result = (url: string, rawContent: string, title = "A page"): Result => ({ url, title, rawContent });
const cacheOf = (first: Record<string, Result[]>, library: Record<string, Result[]> = {}) => ({
  results: (query: string, _excluded: readonly string[], onLibraries: boolean) => (onLibraries ? library : first)[query] ?? null,
});

const spend = { tier: "lightning", costUsd: 0, usageKnown: true, latencyMs: 0 } as const;
const searched = (query: string): RunEvent => ({ type: "searched", query, results: 1, credits: 1, latencyMs: 0 });
const node = (id: string, url: string, reader: Partial<EvidenceNode["reader"]> = {}, foundVia: EvidenceNode["foundVia"] = null): RunEvent => ({
  type: "node_added",
  node: {
    id,
    url,
    host: new URL(url).hostname,
    title: "A page",
    check: { status: "exact", score: 1 },
    reader: { contains_quote: true, exact_snippet: QUOTE, attributed_to: null, page_date: null, cited_source: null, cited_source_date: null, ...reader },
    attributedTo: reader.attributed_to ?? null,
    pageDate: null,
    citedSourceDate: null,
    date: null,
    foundVia,
  },
});
const run = (events: RunEvent[]): SavedRun => ({
  path: "made-up.json",
  caseId: "made-up",
  ranAt: "2026-10-15",
  events: [{ type: "started", quote: QUOTE, popularAttribution: "Marie Antoinette", language: "en", excludeDomains: [] }, ...events],
});

describe("rebuildEvidence with a filter", () => {
  it("leaves a dropped host's pages out of what a cited work's search found", () => {
    // n1 cites the Confessions; the library search for it returned a copy on
    // archive.org, read with no quote.
    const copy = "https://archive.org/stream/confessions00rous/confessions00rous_djvu.txt";
    const saved = run([
      searched(EXACT),
      { type: "pages_ready", pages: 1, droppedExcluded: 0 },
      node("n1", "https://a.org/1", { cited_source: WORK }),
      { type: "traced", ...spend, tier: "super", round: 1, leads: [{ fromNode: "n1", work: WORK, query: LEAD }] },
      searched(LEAD),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 1 },
      { type: "page_read", ...spend, url: copy, host: "archive.org", outcome: "no_quote", reason: null, lookingFor: WORK },
    ]);
    const cache = cacheOf(
      { [EXACT]: [result("https://a.org/1", `Rousseau's ${WORK} has it: ${QUOTE}.`)] },
      { [LEAD]: [result(copy, "I was born at Geneva. ".repeat(600), "The Confessions of Jean-Jacques Rousseau")] },
    );

    expect(rebuildEvidence(saved, "new", cache).citedWorks).toHaveLength(1);
    expect(rebuildEvidence(saved, "new", cache, { requote: false, hosts: ["archive.org"] }).citedWorks).toEqual([]);
    // main's rules list a lead whose search returned no text of the work, which
    // is what the search returned once archive.org is left out.
    const onArchive = (filter?: { requote: boolean; hosts: string[] }) => JSON.stringify(rebuildEvidence(saved, "main", cache, filter).citedWorks).includes("archive.org");
    expect(onArchive()).toBe(true);
    expect(onArchive({ requote: false, hosts: ["archive.org"] })).toBe(false);
  });

  it("keeps a lead's page the first round now reads, on that round's text and found via nothing", () => {
    // The exact search returned 15 pages and the re-quoting one 10 more, so the
    // page only the third search returned came 26th and wasn't read until a lead
    // from a re-quoting page found it. Without the re-quoting search it is 16th.
    const exact = Array.from({ length: 15 }, (_, i) => result(`https://a.org/${i}`, `${QUOTE}, page ${i}`));
    const requote = Array.from({ length: 10 }, (_, i) => result(`https://b.org/${i}`, `${QUOTE}, says page ${i}, from the ${WORK}`));
    const late = "https://late.org/x";
    const saved = run([
      searched(EXACT),
      searched(REQUOTE),
      searched(KEPT),
      { type: "pages_ready", pages: 20, droppedExcluded: 0 },
      node("n16", "https://b.org/0", { cited_source: WORK }),
      { type: "traced", ...spend, tier: "super", round: 1, leads: [{ fromNode: "n16", work: WORK, query: LEAD }] },
      searched(LEAD),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 1 },
      { type: "page_read", ...spend, url: late, host: "late.org", outcome: "evidence", reason: null, lookingFor: WORK },
      node("n21", late, {}, { node: "n16", work: WORK }),
    ]);
    const cache = cacheOf(
      { [EXACT]: exact, [REQUOTE]: requote, [KEPT]: [result(late, `${QUOTE}, they said.`)] },
      { [LEAD]: [result(late, `They said: ${QUOTE}, in ${WORK}.`)] },
    );

    const before = rebuildEvidence(saved, "new", cache);
    expect(before.verified.map((n) => [n.id, n.foundVia])).toEqual([
      ["n16", null],
      ["n21", { node: "n16", work: WORK }],
    ]);

    const after = rebuildEvidence(saved, "new", cache, { requote: true, hosts: [] });
    expect(Object.fromEntries(after.dropped.nodes)).toEqual({ n16: "search" });
    expect(after.verified.map((n) => [n.id, n.foundVia])).toEqual([["n21", null]]);
  });

  it("checks the credit again on the kept search's text", () => {
    // The re-quoting search returned the page with the credit on it, and the
    // reader saw that text; a kept search returned it without.
    const shared = "https://c.org/3";
    const saved = run([
      searched(EXACT),
      searched(REQUOTE),
      searched(KEPT),
      { type: "pages_ready", pages: 2, droppedExcluded: 0 },
      node("n1", "https://a.org/1"),
      node("n2", shared, { attributed_to: "Marie Antoinette" }),
    ]);
    const cache = cacheOf({
      [EXACT]: [result("https://a.org/1", `${QUOTE}, as the saying goes.`)],
      [REQUOTE]: [result(shared, `Marie Antoinette said: ${QUOTE}.`)],
      [KEPT]: [result(shared, `${QUOTE}, or so it is told.`)],
    });

    const credit = (filter?: { requote: boolean; hosts: string[] }) =>
      rebuildEvidence(saved, "new", cache, filter).verified.find((n) => n.id === "n2")?.attributedTo;
    expect(credit()).toBe("Marie Antoinette");
    expect(credit({ requote: true, hosts: [] })).toBeNull();
  });
});
