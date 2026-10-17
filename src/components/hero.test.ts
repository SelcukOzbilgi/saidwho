import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../cases/cases";
import { Hero } from "./hero";
import { earliestTrace } from "./verdict-card";

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

  it("tells the featured case from the saved run: the quote, the struck credit and the earliest trace", () => {
    const html = render();
    const { run } = featured;
    const earliest = earliestTrace(run.verdict!.output, run.nodes)!;
    expect(text(html)).toContain(run.quote);
    expect(html).toMatch(new RegExp(`<s [^>]*>${run.popularAttribution}</s>`));
    expect(html).toContain(`<span class="sr-only">${earliest.trace}</span>`);
    expect(text(html)).toContain(`via ${earliest.via}`);
    expect(html).toContain("Albert Einstein probably didn&#x27;t say it");
  });

  it("is rendered as it ends, so it reads without JavaScript; only the stylesheet plays it", () => {
    const html = render();
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/opacity:\s*0/);
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
