import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../../cases/cases";
import { verdictWords } from "../../lib/run-state";
import { Hero, heroTrace } from "../hero";

const featured = findCase(FEATURED_CASE_ID)!;
const render = (example = featured) => renderToStaticMarkup(createElement(Hero, { featured: example, version: "headline" }));
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Hero headline", () => {
  it("sets the saved quote as a blockquote and corrects its credit with the saved trace and verdict", () => {
    const html = render();
    const { output, credit, earliest } = heroTrace(featured)!;
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Said Who?");
    expect(html).toMatch(new RegExp(`<blockquote[^>]*lang="${featured.run.language}"`));
    expect(text(html)).toContain(featured.run.quote);
    expect(html).toMatch(new RegExp(`<s [^>]*>${credit}</s>`));
    expect(html).toContain(`<span class="sr-only">${earliest.trace}</span>`);
    expect(text(html)).toContain(`via ${earliest.via}`);
    expect(text(html)).toContain(verdictWords(output.verdict));
    expect(text(html)).toContain(`${output.confidence} confidence`);
    expect(html).toContain(`href="/cases/${featured.caseId}"`);
    expect(html).toContain('href="#featured"');
    expect(html).toContain('href="/run"');
  });

  it("renders the finished content without hiding it on the server", () => {
    const html = render();
    expect(html).not.toMatch(/opacity:\s*0|visibility:\s*hidden|display:\s*none|\shidden[\s=>]/);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("hero-rewind");
    expect(html).not.toContain("being built");
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
    expect(html).toMatch(/<s [^>]*>Another name<\/s>/);
    expect(text(html)).toContain("Another source, 1972");
    expect(text(html)).toContain("medium confidence");
    expect(text(html)).toContain(verdictWords("contested"));
    expect(html).toContain('href="/cases/another-case"');
    expect(text(html)).not.toContain(featured.run.quote);
  });
});
