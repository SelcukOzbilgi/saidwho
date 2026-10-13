import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvidenceNode } from "../agent/events";
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
