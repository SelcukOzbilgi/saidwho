import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../../cases/cases";
import { verdictWords } from "../../lib/run-state";
import { trailOf } from "../featured-case";
import { Hero, heroTrace } from "../hero";
import { rewindFile } from "./rewind";

const featured = findCase(FEATURED_CASE_ID)!;
const render = (example = featured) => renderToStaticMarkup(createElement(Hero, { featured: example, version: "rewind" }));
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Hero at ?hero=rewind", () => {
  it("keeps the one h1 and both buttons, and links the case and every step on its trail", () => {
    const html = render();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('href="#featured"');
    expect(html).toContain('href="/run"');
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}"`);
    for (const { node } of trailOf(featured.run).steps) {
      expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}#node-${node.id}"`);
    }
  });

  it("shows the quote, the struck credit, the trail newest first and the earliest trace, all from the saved run", () => {
    const html = render();
    const { run } = featured;
    const trace = heroTrace(featured)!;
    expect(html).toMatch(new RegExp(`<blockquote lang="${run.language}"[^>]*>“${run.quote}”</blockquote>`));
    expect(html).toMatch(new RegExp(`<s [^>]*>${run.popularAttribution}</s>`));

    // The steps after the first, newest at the top, then the earliest trace at the bottom.
    const { steps } = trailOf(run);
    const hosts = steps.map((s) => s.node.host).reverse();
    const at = hosts.map((h) => html.indexOf(`>${h}</a>`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (const step of steps.slice(1)) expect(text(html)).toContain(step.note.replace(/\.$/, ""));

    // The counter shows the year; the row keeps the rest of the trace, and a screen reader hears both.
    const year = trace.output.earliest_date!.slice(0, 4);
    expect(text(html)).toContain(`${year}, ${rewindFile({ featured, trace }).earliest.text}`);
    expect(trace.earliest.trace).toBe(`${year}, ${rewindFile({ featured, trace }).earliest.text}`);
    expect(text(html)).toContain(`via ${trace.earliest.via}`);
    expect(text(html)).toContain(verdictWords(trace.output.verdict));
    expect(html).toContain("Albert Einstein probably didn&#x27;t say it");
  });

  it("prints no year but the earliest trace's, since a step's page date may be its own or a cited work's", () => {
    // Tags become spaces here, so the counter and the row's own year read as two words.
    const words = render().replace(/<[^>]+>/g, " ");
    const years = new Set(words.match(/(?<!\d)(?:1[5-9]|20)\d\d(?!\d)/g));
    expect([...years]).toEqual([heroTrace(featured)!.output.earliest_date!.slice(0, 4)]);
  });

  it("is rendered as it ends, with the counter on the earliest year, so it reads without JavaScript", () => {
    const html = render();
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toContain("hero-rewind");
    expect(html).toMatch(/--rewind-to:1980[^"]*">1980</);
  });

  it("falls back to the quote, the credit and the earliest trace where the run has no trail", () => {
    const plain = findCase("so-much-owed")!;
    const trace = heroTrace(plain)!;
    expect(trailOf(plain.run).steps).toHaveLength(0);
    const html = render(plain);
    expect(text(html)).toContain(plain.run.quote);
    expect(text(html)).toContain(trace.earliest.trace);
    expect(text(html)).toContain(plain.run.popularAttribution!);
    // The run found the credit right, so nothing is struck.
    expect(html).not.toContain("<s ");
    expect(rewindFile({ featured: plain, trace }).rows).toHaveLength(0);
  });
});
