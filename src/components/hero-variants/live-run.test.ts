import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type EvidenceNode, type RunEvent, SNIPPET_NOT_ON_PAGE } from "../../agent/events";
import { type ExampleCase, FEATURED_CASE_ID, findCase } from "../../cases/cases";
import { verdictWords } from "../../lib/run-state";
import { Hero } from "../hero";
import { earliestTrace } from "../verdict-card";
import { runSteps } from "./live-run";

const featured = findCase(FEATURED_CASE_ID)!;
const render = () => renderToStaticMarkup(createElement(Hero, { featured, version: "run" }));
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Hero at ?hero=run", () => {
  it("keeps the one h1 and the intro, and links to the case and the run page", () => {
    const html = render();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="#featured"');
    expect(html).toContain('href="/run"');
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}"`);
  });

  it("starts from what the run was given: the quote in its language and the name it is shared under", () => {
    const html = render();
    const { run } = featured;
    expect(html).toContain(`<blockquote lang="${run.language}"`);
    expect(text(html)).toContain(run.quote);
    // Struck, and still in the text.
    expect(html).toMatch(new RegExp(`<s [^>]*>${run.popularAttribution}</s>`));
  });

  it("strikes the name only when the run found it wrong", () => {
    const right = findCase("so-much-owed")!;
    const html = renderToStaticMarkup(createElement(Hero, { featured: right, version: "run" }));
    expect(text(html)).toContain(right.run.popularAttribution!);
    expect(html).not.toContain("<s ");
  });

  it("plays the case's own steps, with the numbers its events hold", () => {
    const steps = runSteps(featured);
    expect(steps.map((s) => s.name)).toEqual(["Planner", "Search", "Readers", "Checker", "Genealogist", "Judge"]);
    const said = Object.fromEntries(steps.map((s) => [s.name, s.said.join("")]));
    const { run, events } = featured;

    expect(said.Planner).toBe(`Planned ${run.plan!.queries.length} searches, ${run.plan!.variants.length} other wordings`);
    expect(said.Search).toContain(`Ran ${run.searches} searches`);
    // The Checker counts only the snippets it turned down, not a page that was too long to read.
    const turnedDown = events.filter((e) => e.type === "escalated" && e.reason === "the snippet is not on the page").length;
    expect(turnedDown).toBeGreaterThan(0);
    expect(said.Checker).toContain(`threw ${turnedDown} out`);
    expect(said.Genealogist).toMatch(/^1 round back, \d+ more pages, 1 kept$/);
    expect(said.Judge).toBe(`Weighed ${run.nodes.length} kept pages`);

    // Every step and its words are in the markup, as it ends.
    const shown = text(render());
    for (const step of steps) {
      expect(shown).toContain(step.name);
      expect(shown).toContain(step.said.join(""));
    }
  });

  it("ends on what the run found: the earliest trace, the verdict, and its sources, cost and time", () => {
    const html = render();
    const { run } = featured;
    const output = run.verdict!.output;
    const earliest = earliestTrace(output, run.nodes)!;
    expect(html).toContain(`<span class="sr-only">${earliest.trace}</span>`);
    expect(text(html)).toContain(`via ${earliest.via}`);
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}#node-${output.earliest_node}"`);
    expect(text(html)).toContain(verdictWords(output.verdict));
    expect(text(html)).toContain(`${output.confidence} confidence`);
    const sources = run.nodes.filter((n) => n.check.status !== "not_found").length;
    expect(text(html)).toContain(`${sources} sources · $${run.nebiusUsd.toFixed(4)} on Nebius · ${run.seconds} s`);
  });

  it("is rendered as it ends, so it reads without JavaScript; only the stylesheet plays it", () => {
    const html = render();
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/visibility:\s*hidden|display:\s*none/);
    expect(html).not.toContain("hero-rewind");
    expect(html).not.toContain("undefined");
  });
});

// Small made-up runs, so runSteps' own rules are pinned down and not only what
// the featured run happens to give.
describe("runSteps", () => {
  const spend = { model: "m", latencyMs: 1 };
  const node = (id: string, status: EvidenceNode["check"]["status"]) =>
    ({ id, check: { status, score: status === "not_found" ? 0 : 1 } }) as EvidenceNode;
  const ev = (e: Record<string, unknown>) => e as unknown as RunEvent;
  const planned = ev({ type: "planned", ...spend, variants: [], candidateAuthors: [], queries: ["a", "b"] });
  const searched = (query: string) => ev({ type: "searched", query, results: 3, credits: 1, latencyMs: 1 });
  const read = (url: string) => ev({ type: "page_read", ...spend, url, host: "h", outcome: "evidence", reason: null });
  const reread = (url: string, to: string, reason = SNIPPET_NOT_ON_PAGE) =>
    ev({ type: "escalated", step: "read", from: "nano", to, thinking: false, reason, url });
  const added = (n: EvidenceNode) => ev({ type: "node_added", node: n });
  const verdict = ev({ type: "verdict", ...spend, verdict: {}, unknownIds: [] });
  const steps = (events: RunEvent[], nodes: EvidenceNode[] = []) =>
    Object.fromEntries(
      runSteps({ events, run: { nodes } as unknown as ExampleCase["run"] }).map((s) => [s.name, s.said.join("")]),
    );

  it("leaves out the other wordings, the Genealogist and the throws when the run has none", () => {
    const said = steps(
      [planned, searched("a"), searched("b"), ev({ type: "pages_ready", pages: 1, droppedExcluded: 0 }), read("u1"), added(node("n1", "exact")), verdict],
      [node("n1", "exact")],
    );
    expect(Object.keys(said)).toEqual(["Planner", "Search", "Readers", "Checker", "Judge"]);
    expect(said.Planner).toBe("Planned 2 searches");
    expect(said.Search).toBe("Ran 2 searches, 1 page to read");
    expect(said.Readers).toBe("Read 1 page");
    expect(said.Checker).toBe("Kept 1 snippet, threw none out");
    expect(said.Judge).toBe("Weighed 1 kept page");
  });

  it("names the model rereads went to only when they all went to one", () => {
    const one = steps([read("u1"), read("u2"), reread("u1", "super"), reread("u2", "super")]);
    expect(one.Readers).toBe("Read 2 pages, 2 again on Nemotron 3 Super");
    const two = steps([read("u1"), read("u2"), reread("u1", "super"), reread("u2", "ultra")]);
    expect(two.Readers).toBe("Read 2 pages, 2 again");
  });

  it("counts as thrown a snippet turned down and a crossed-out card, not a page too long to read", () => {
    const said = steps([
      read("u1"),
      read("u2"),
      reread("u1", "super"),
      reread("u2", "super", "the page is too long"),
      added(node("n1", "not_found")),
      added(node("n2", "near")),
    ]);
    expect(said.Checker).toBe("Kept 1 snippet, threw 2 out");
  });

  it("says the Genealogist found nothing older when it traced no round, and counts a round's pages apart", () => {
    const none = steps([read("u1"), added(node("n1", "exact")), ev({ type: "traced", ...spend, round: 0, leads: [] })]);
    expect(none.Genealogist).toBe("Found nothing older to follow");
    const failed = steps([read("u1"), ev({ type: "trace_failed", ...spend, round: 1, reason: "x" })]);
    expect(failed.Genealogist).toBe("Found nothing older to follow");

    const round = steps([
      read("u1"),
      added(node("n1", "exact")),
      ev({ type: "traced", ...spend, round: 1, leads: [{ fromNode: "n1", work: "w", query: "q" }] }),
      ev({ type: "pages_ready", pages: 2, droppedExcluded: 0, round: 1 }),
      read("u2"),
      added(node("n2", "exact")),
      added(node("n3", "not_found")),
    ]);
    expect(round.Genealogist).toBe("1 round back, 2 more pages, 1 kept");
    // A round's pages are not counted again as the first pass's.
    expect(round.Readers).toBe("Read 1 page");
    expect(round.Checker).toBe("Kept 1 snippet, threw none out");
  });
});
