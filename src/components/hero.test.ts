import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FEATURED_CASE_ID, findCase } from "../cases/cases";
import { Hero } from "./hero";
import { yearStrip } from "./hero-b";
import { earliestTrace, HEADLINE } from "./verdict-card";

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

describe("Hero, version b", () => {
  const { run } = featured;
  const output = run.verdict!.output;
  const renderB = () => renderToStaticMarkup(createElement(Hero, { featured, version: "b" }));

  it("tells the same case as version a: the quote, the credit, the earliest trace and the verdict", () => {
    const html = renderB();
    const earliest = earliestTrace(output, run.nodes)!;
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(text(html)).toContain(run.quote);
    expect(text(html)).toContain(`Usually credited to ${run.popularAttribution}`);
    expect(text(html)).toContain(earliest.trace);
    expect(text(html)).toContain(`via ${earliest.via}`);
    expect(text(html).replaceAll("&#x27;", "'")).toContain(HEADLINE[output.verdict](run.popularAttribution));
    expect(html).toContain('href="#featured"');
    expect(html).toContain('href="/run"');
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}"`);
    // Version a's card, with its struck credit, is not there.
    expect(html).not.toContain("<s ");
  });

  it("puts a mark on the strip for each page the Checker kept that gives a year, in the order the run found them", () => {
    const html = renderB();
    const dated = run.nodes.filter((n) => n.check.status !== "not_found" && n.date);
    const titles = [...html.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
    expect(titles).toEqual(dated.map((n) => `${n.host}, ${n.date!.slice(0, 4)}`));
    expect(html.match(/hero-mark/g)).toHaveLength(dated.length);
    const kept = run.nodes.filter((n) => n.check.status !== "not_found").length;
    expect(text(html)).toContain(`${kept - dated.length} give no year`);
  });

  it("is rendered as it ends, so it reads without JavaScript", () => {
    const html = renderB();
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toContain("hero-rewind");
  });

  it("keeps the name and the copy without a featured case", () => {
    const html = renderToStaticMarkup(createElement(Hero, { featured: undefined, version: "b" }));
    expect(html).toContain("Said Who?");
    expect(html).toContain("Paste a quote you saw online");
    expect(html).not.toContain("<figure");
  });
});

describe("yearStrip", () => {
  const node = (id: string, date: string | null, status: "exact" | "near" | "not_found" = "exact") =>
    ({ ...featured.run.nodes[0], id, host: `${id}.org`, date, check: { status, score: 1 } }) as (typeof featured.run.nodes)[number];

  it("stacks the pages of one year in the order they came, and leaves out crossed-out and undated ones", () => {
    const strip = yearStrip([node("a", "2001"), node("b", "1990-05"), node("c", "2001"), node("d", null), node("e", "1980", "not_found")], "b");
    expect(strip.marks.map((m) => [m.id, m.year, m.stack, m.earliest])).toEqual([
      ["a", 2001, 0, false],
      ["b", 1990, 0, true],
      ["c", 2001, 1, false],
    ]);
    expect(strip.kept).toBe(4);
    expect(strip.undated).toBe(1);
    expect([strip.from, strip.to]).toEqual([1988, 2003]);
    expect(strip.decades).toEqual([1990, 2000]);
  });
});
