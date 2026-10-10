import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvidenceNode } from "../agent/events";
import { Timeline } from "./timeline";

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
