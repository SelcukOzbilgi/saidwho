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

  it("drops a lead's page and what it led to when the page the lead came from is dropped", () => {
    // n16 came only from the re-quoting search. A lead from it found late.org,
    // which a kept search returned too, and a lead from that page found n24.
    const late = "https://late.org/x";
    const later = "https://later.org/y";
    const saved = run([
      searched(EXACT),
      searched(REQUOTE),
      searched(KEPT),
      { type: "pages_ready", pages: 3, droppedExcluded: 0 },
      node("n1", "https://a.org/1"),
      node("n16", "https://b.org/0", { cited_source: WORK }),
      { type: "traced", ...spend, tier: "super", round: 1, leads: [{ fromNode: "n16", work: WORK, query: LEAD }] },
      searched(LEAD),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 1 },
      { type: "page_read", ...spend, url: late, host: "late.org", outcome: "evidence", reason: null, lookingFor: WORK },
      node("n21", late, { cited_source: "Émile" }, { node: "n16", work: WORK }),
      { type: "traced", ...spend, tier: "super", round: 2, leads: [{ fromNode: "n21", work: "Émile", query: "Rousseau Émile full text" }] },
      searched("Rousseau Émile full text"),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 2 },
      { type: "page_read", ...spend, url: later, host: "later.org", outcome: "evidence", reason: null, lookingFor: "Émile" },
      node("n24", later, {}, { node: "n21", work: "Émile" }),
    ]);
    const cache = cacheOf(
      {
        [EXACT]: [result("https://a.org/1", `${QUOTE}, as the saying goes.`)],
        [REQUOTE]: [result("https://b.org/0", `${QUOTE}, from the ${WORK}.`)],
        [KEPT]: [result(late, "Brioche, they said.")],
      },
      { [LEAD]: [result(late, `They said: ${QUOTE}, in Émile.`)], "Rousseau Émile full text": [result(later, `${QUOTE}, it says.`)] },
    );

    expect(rebuildEvidence(saved, "new", cache).verified.map((n) => n.id)).toEqual(["n1", "n16", "n21", "n24"]);
    const after = rebuildEvidence(saved, "new", cache, { requote: true, hosts: [] });
    expect(Object.fromEntries(after.dropped.nodes)).toEqual({ n16: "search", n21: "lead", n24: "lead" });
    expect(after.verified.map((n) => n.id)).toEqual(["n1"]);
  });

  it("leaves a canceled lead search's text out of what settles a kept lead's cited work", () => {
    // n1 cites the Confessions and its library search returned a copy read with
    // no quote. n16, only from the re-quoting search, cited another work whose
    // search returned the same copy with the saying in its text.
    const copy = "https://archive.org/stream/confessions00rous/confessions00rous_djvu.txt";
    const other = "Rousseau Memoirs full text";
    const saved = run([
      searched(EXACT),
      searched(REQUOTE),
      { type: "pages_ready", pages: 2, droppedExcluded: 0 },
      node("n1", "https://a.org/1", { cited_source: WORK }),
      node("n16", "https://b.org/0", { cited_source: "Memoirs" }),
      {
        type: "traced",
        ...spend,
        tier: "super",
        round: 1,
        leads: [
          { fromNode: "n1", work: WORK, query: LEAD },
          { fromNode: "n16", work: "Memoirs", query: other },
        ],
      },
      searched(LEAD),
      searched(other),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 1 },
      { type: "page_read", ...spend, url: copy, host: "archive.org", outcome: "no_quote", reason: null, lookingFor: WORK },
    ]);
    const title = "The Confessions of Jean-Jacques Rousseau";
    const cache = cacheOf(
      {
        [EXACT]: [result("https://a.org/1", `Rousseau's ${WORK} has it: ${QUOTE}.`)],
        [REQUOTE]: [result("https://b.org/0", `${QUOTE}, from the Memoirs.`)],
      },
      {
        [LEAD]: [result(copy, "I was born at Geneva. ".repeat(600), title)],
        [other]: [result(copy, `${"I was born at Geneva. ".repeat(600)} ${QUOTE}.`, title)],
      },
    );

    expect(rebuildEvidence(saved, "new", cache).citedWorks).toEqual([]);
    const after = rebuildEvidence(saved, "new", cache, { requote: true, hosts: [] });
    expect(after.dropped.leads).toBe(1);
    expect(after.citedWorks.map((w) => w.work)).toEqual([WORK]);
  });

  it("leaves a canceled lead search's readings out of what settles a kept lead's cited work", () => {
    // As above, but the copy came back from the Memoirs search with the saying,
    // was read and became n20. The filter drops n16, so that reading never
    // happened, and the Confessions copy read with no quote counts again.
    const copy = "https://archive.org/stream/confessions00rous/confessions00rous_djvu.txt";
    const other = "Rousseau Memoirs full text";
    const saved = run([
      searched(EXACT),
      searched(REQUOTE),
      { type: "pages_ready", pages: 2, droppedExcluded: 0 },
      node("n1", "https://a.org/1", { cited_source: WORK }),
      node("n16", "https://b.org/0", { cited_source: "Memoirs" }),
      {
        type: "traced",
        ...spend,
        tier: "super",
        round: 1,
        leads: [
          { fromNode: "n1", work: WORK, query: LEAD },
          { fromNode: "n16", work: "Memoirs", query: other },
        ],
      },
      searched(LEAD),
      searched(other),
      { type: "pages_ready", pages: 1, droppedExcluded: 0, round: 1 },
      { type: "page_read", ...spend, url: copy, host: "archive.org", outcome: "no_quote", reason: null, lookingFor: WORK },
      { type: "page_read", ...spend, url: copy, host: "archive.org", outcome: "evidence", reason: null, lookingFor: "Memoirs" },
      node("n20", copy, {}, { node: "n16", work: "Memoirs" }),
    ]);
    const title = "The Confessions of Jean-Jacques Rousseau";
    const cache = cacheOf(
      {
        [EXACT]: [result("https://a.org/1", `Rousseau's ${WORK} has it: ${QUOTE}.`)],
        [REQUOTE]: [result("https://b.org/0", `${QUOTE}, from the Memoirs.`)],
      },
      {
        [LEAD]: [result(copy, "I was born at Geneva. ".repeat(600), title)],
        [other]: [result(copy, "I was born at Geneva. ".repeat(600), title)],
      },
    );

    expect(rebuildEvidence(saved, "new", cache).citedWorks).toEqual([]);
    const after = rebuildEvidence(saved, "new", cache, { requote: true, hosts: [] });
    expect(after.citedWorks.map((w) => w.work)).toEqual([WORK]);
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
