import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JudgeOutput } from "../agent/schemas";
import { Rationale, VerdictCard } from "./verdict-card";

const render = (text: string, confirmed: string[] = ["n2"]) =>
  renderToStaticMarkup(createElement(Rationale, { text, confirmed: new Set(confirmed) }));

describe("Rationale", () => {
  it("links an id in plain text, in brackets and in bold", () => {
    expect(render("See n2.")).toContain('href="#node-n2"');
    expect(render("See [n2].")).toContain('href="#node-n2"');
    const bold = render("See **[n2]**.");
    expect(bold).toContain("<strong>");
    expect(bold).toContain('href="#node-n2"');
  });

  it("crosses out an id no page backed up, in italics too", () => {
    const html = render("It leans on *n9*.");
    expect(html).toContain("<em>");
    expect(html).toContain("line-through");
    expect(html).not.toContain("#node-n9");
  });

  it("keeps titles in italics", () => {
    expect(render("In _Sudden Death_ (1983)")).toContain("<em>Sudden Death</em>");
  });
});

describe("VerdictCard", () => {
  const output = (verdict: JudgeOutput["verdict"]): JudgeOutput => ({
    verdict,
    earliest_node: null,
    earliest_author: "Indian Opinion",
    earliest_date: "1913",
    misattribution_node: null,
    confidence: "medium",
    rationale: "Thin evidence.",
  });
  const headline = (verdict: JudgeOutput["verdict"], popularAttribution: string | null) =>
    /<h2[^>]*>([^<]*)<\/h2>/.exec(
      renderToStaticMarkup(
        createElement(VerdictCard, {
          verdict: { tier: "super", output: output(verdict), unknownIds: [] },
          noVerdict: null,
          stopped: null,
          finished: true,
          popularAttribution,
          nodes: [],
        }),
      ).replaceAll("&#x27;", "'"),
    )?.[1];

  it("weighs the usual credit when there is one, and claims none when no one was named", () => {
    expect(headline("misattributed", "Mahatma Gandhi")).toBe("Mahatma Gandhi probably didn't say it");
    expect(headline("correct", "Mahatma Gandhi")).toBe("Mahatma Gandhi said it");
    expect(headline("misattributed", null)).toBe("What the sources show");
    expect(headline("correct", null)).toBe("What the sources show");
    expect(headline("contested", null)).toBe("Where it comes from is contested");
  });
});
