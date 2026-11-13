import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvidenceNode } from "../agent/events";
import { CASES } from "../cases/cases";
import { RunView } from "./run-view";
import { Timeline, unmark } from "./timeline";

const node = (id: string, foundVia: EvidenceNode["foundVia"]): EvidenceNode => ({
  id,
  url: `https://example.org/${id}`,
  host: "example.org",
  title: id,
  check: { status: "exact", score: 1 },
  reader: {
    contains_quote: true,
    exact_snippet: "a quote",
    attributed_to: null,
    page_date: null,
    cited_source: null,
    cited_source_date: null,
  },
  attributedTo: null,
  pageDate: null,
  citedSourceDate: null,
  date: null,
  foundVia,
});

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("Timeline", () => {
  it("says which node's citation led to a page", () => {
    const html = renderToStaticMarkup(
      createElement(Timeline, {
        nodes: [node("n1", null), node("n4", { node: "n1", work: "Rousseau, Confessions" })],
        marks: { earliest: null, misattribution: null },
      }),
    );
    expect(html).toContain('href="#node-n1"');
    expect(text(html)).toContain("Found vian1, looking for Rousseau, Confessions");
    // Saved runs from before the Genealogist have no foundVia key at all.
    const older = renderToStaticMarkup(
      createElement(Timeline, { nodes: [{ ...node("n1", null), foundVia: undefined }], marks: { earliest: null, misattribution: null } }),
    );
    expect(text(older)).not.toContain("Found via");
  });
});

describe("Timeline excerpt language", () => {
  const marks = { earliest: null, misattribution: null };
  const excerpts = (html: string) => html.match(/<blockquote[^>]*>/g) ?? [];

  it("marks an excerpt with the run's language", () => {
    const tr = renderToStaticMarkup(createElement(Timeline, { nodes: [node("n1", null)], marks, language: "tr" }));
    expect(excerpts(tr)).toHaveLength(1);
    expect(excerpts(tr)[0]).toContain('lang="tr"');
    const en = renderToStaticMarkup(createElement(Timeline, { nodes: [node("n1", null)], marks, language: "en" }));
    expect(excerpts(en)[0]).toContain('lang="en"');
  });

  it("leaves the tag off when the run has no language", () => {
    for (const language of [null, undefined]) {
      const html = renderToStaticMarkup(createElement(Timeline, { nodes: [node("n1", null)], marks, language }));
      expect(excerpts(html)[0]).not.toContain("lang=");
    }
  });

  it("gets the language from the run on a case page", () => {
    const tr = CASES.find((c) => c.caseId === "en-hakiki-mursit")!.run;
    const html = renderToStaticMarkup(createElement(RunView, { run: tr, running: false }));
    // The quote's own tag aside, every excerpt carries it too.
    const quotes = excerpts(html).filter((b) => b.includes("text-[17px]"));
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(q).toContain('lang="tr"');
  });
});

describe("unmark", () => {
  it("drops Markdown emphasis marks and keeps the words", () => {
    expect(unmark("Rita Mae Brown, _Sudden Death_ (1983)")).toBe("Rita Mae Brown, Sudden Death (1983)");
    expect(unmark("the **same** thing, *over* and __over__")).toBe("the same thing, over and over");
  });

  it("leaves underscores and stars that aren't emphasis alone", () => {
    expect(unmark("see snake_case_name and 5 * 3 * 2")).toBe("see snake_case_name and 5 * 3 * 2");
    expect(unmark("a lone _ mark")).toBe("a lone _ mark");
  });

  it("leaves marks inside a word alone, so the quote isn't changed", () => {
    expect(unmark("f**k that and sh**t")).toBe("f**k that and sh**t");
    expect(unmark("f*ck and sh*t")).toBe("f*ck and sh*t");
    expect(unmark("2*3*4 = 24")).toBe("2*3*4 = 24");
    expect(unmark("Kâfir*olsan*")).toBe("Kâfir*olsan*");
    expect(unmark("İster _Kâfir_ ister Mecusi")).toBe("İster Kâfir ister Mecusi");
  });
});
