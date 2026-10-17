import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import { Hero, heroTrace } from "./hero";

const featured = findCase(FEATURED_CASE_ID)!;
const render = (example: typeof featured | undefined = featured) =>
  renderToStaticMarkup(createElement(Hero, { featured: example }));
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Hero", () => {
  it("names the site in its one h1 and points to a finished case and to the run page", () => {
    const html = render();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Said Who?");
    expect(html).toContain('href="#featured"');
    expect(html).toContain('href="/run"');
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}"`);
  });

  it("sets the saved quote as a blockquote and corrects its credit with the saved trace and verdict", () => {
    const html = render();
    const { output, credit, earliest } = heroTrace(featured)!;
    expect(html).toMatch(new RegExp(`<blockquote[^>]*lang="${featured.run.language}"`));
    expect(text(html)).toContain(featured.run.quote);
    expect(html).toMatch(new RegExp(`<s [^>]*>${credit}</s>`));
    expect(html).toContain(`<span class="sr-only">${earliest.trace}</span>`);
    expect(text(html)).toContain(`via ${earliest.via}`);
    expect(text(html)).toContain(verdictWords(output.verdict));
    expect(text(html)).toContain(`${output.confidence} confidence`);
  });

  it("strikes the credit only when the run found it wrong", () => {
    const right = findCase("so-much-owed")!;
    const html = render(right);
    expect(text(html)).toContain(right.run.popularAttribution!);
    expect(html).not.toContain("<s ");
  });

  it("takes replacement case copy and confidence from the run", () => {
    const example = structuredClone(featured);
    example.caseId = "another-case";
    example.run.quote = "A different saved quote.";
    example.run.language = "fr";
    example.run.popularAttribution = "Another name";
    example.run.verdict!.output.verdict = "contested";
    example.run.verdict!.output.confidence = "medium";
    example.run.verdict!.output.earliest_author = "Another source";
    example.run.verdict!.output.earliest_date = "1972";
    const html = render(example);
    expect(text(html)).toContain("A different saved quote.");
    expect(html).toContain('lang="fr"');
    // Contested: the name is not crossed out, since the run didn't find it wrong.
    expect(text(html)).toContain("Another name");
    expect(html).not.toContain("<s ");
    expect(text(html)).toContain("Another source, 1972");
    expect(text(html)).toContain("medium confidence");
    expect(text(html)).toContain(verdictWords("contested"));
    expect(html).toContain('href="/cases/another-case"');
    expect(text(html)).not.toContain(featured.run.quote);
  });

  it("is rendered as it ends, so it reads without JavaScript; only the stylesheet plays it", () => {
    const html = render();
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/opacity:\s*0|visibility:\s*hidden|display:\s*none|\shidden[\s=>]|--marker-reach/);
    expect(html).not.toContain("hero-rewind");
  });

  it("keeps the name and both lines of copy without a featured case", () => {
    const html = renderToStaticMarkup(createElement(Hero, { featured: undefined }));
    expect(html).toContain("Said Who?");
    expect(html).toContain("Paste a quote you saw online");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain('href="#featured"');
  });
});
