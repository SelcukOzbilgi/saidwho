import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { JudgeOutput } from "../agent/schemas";
import { findCase } from "../cases/cases";
import { earliestTrace, Rationale, VerdictCard } from "./verdict-card";

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

  it("makes glued ids separate chips with a space between, and keeps field names out", () => {
    const html = render("Earliest_date is null.[n1][n2]", ["n1", "n2"]);
    expect(html).toContain('href="#node-n1"');
    expect(html).toContain('href="#node-n2"');
    expect(html.replace(/<[^>]+>/g, "")).toBe("Earliest date is not given. n1 n2");
  });

  it("makes one chip for an id cited in and out of bold, with a space before it", () => {
    const html = render("See **[n3]**[n3].", ["n3"]);
    expect(html.match(/href="#node-n3"/g)).toHaveLength(1);
    expect(html).toContain("<strong>");
    expect(html.replace(/<[^>]+>/g, "")).toBe("See n3.");
    const two = render("Both **[n3]**[n4] agree.", ["n3", "n4"]);
    expect(two.replace(/<[^>]+>/g, "")).toBe("Both n3 n4 agree.");
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
          verdict: { tier: "super", output: output(verdict) },
          noVerdict: null,
          stopped: null,
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

describe("earliestTrace", () => {
  const saved = (id: string) => {
    const { run } = findCase(id)!;
    return { output: run.verdict!.output, nodes: run.nodes };
  };

  it("gives the Judge's author and date as they are when it named someone", () => {
    const { output, nodes } = saved("so-much-owed");
    expect(earliestTrace(output, nodes)).toEqual({ trace: "Winston Churchill, 1940", via: null });
  });

  it("names the cited work and the page it came from when the Judge left the author empty", () => {
    const { output, nodes } = saved("good-men-do-nothing");
    expect(output.earliest_author).toBeNull();
    expect(earliestTrace(output, nodes)).toEqual({ trace: "1999, alt.quotations newsgroup", via: "tartarus.org" });
  });

  it("names only the page when the year is the page's own, not that of a work it cites", () => {
    const { output, nodes } = saved("en-hakiki-mursit");
    expect(earliestTrace(output, nodes)).toEqual({ trace: "2019", via: "ackizyurdu.com" });
  });

  it("names no page that doesn't carry the Judge's year", () => {
    // The Judge gave 1999 but pointed to an hbr.org page from 2011.
    const { output, nodes } = saved("faster-horses");
    expect(earliestTrace(output, nodes)).toEqual({ trace: "1999", via: null });
  });

  it("names no page the Checker didn't confirm", () => {
    const { output, nodes } = saved("good-men-do-nothing");
    const crossed = nodes.map((n) => (n.id === output.earliest_node ? { ...n, check: { ...n.check, status: "not_found" as const } } : n));
    expect(earliestTrace(output, crossed)).toEqual({ trace: "1999", via: null });
  });

  it("is nothing when the Judge gave neither author nor date", () => {
    const { output, nodes } = saved("gel-ne-olursan-ol");
    expect(earliestTrace(output, nodes)).toBeNull();
  });
});
