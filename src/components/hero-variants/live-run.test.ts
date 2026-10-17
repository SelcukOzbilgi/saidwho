import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../../cases/cases";
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
