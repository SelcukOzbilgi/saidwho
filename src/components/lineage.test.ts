import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvidenceNode } from "../agent/events";
import type { LineageStep } from "../agent/schemas";
import { Lineage } from "./lineage";

const node = (id: string, date: string | null, status: EvidenceNode["check"]["status"] = "exact"): EvidenceNode => ({
  id,
  url: `https://example.org/${id}`,
  host: "example.org",
  title: "A page",
  check: { status, score: status === "not_found" ? 0 : 1 },
  reader: { contains_quote: true, exact_snippet: "A saying", attributed_to: null, page_date: date, cited_source: null, cited_source_date: null },
  attributedTo: null,
  pageDate: date,
  citedSourceDate: null,
  date,
});
const NODES = [node("n1", "1981-10-11"), node("n2", "1990"), node("n3", null, "not_found")];
const STEPS: LineageStep[] = [
  { node: "n1", change: "first", note: "A newspaper has it with no name." },
  { node: "n3", change: "wording", note: "A tidier wording." },
  { node: "n2", change: "credit", note: "Credited to Einstein from here, after [n1]." },
];
const render = (steps: LineageStep[]) => renderToStaticMarkup(createElement(Lineage, { steps, nodes: NODES }));

describe("Lineage", () => {
  it("shows each step on a confirmed page in the judge's order, with a link to the page", () => {
    const html = render(STEPS);
    expect(html).toContain("First seen");
    expect(html).toContain("Credit changes");
    expect(html.indexOf("with no name")).toBeLessThan(html.indexOf("Credited to Einstein"));
    expect(html).toContain('href="#node-n2"');
    expect(html).toContain('href="#node-n1"');
  });

  it("leaves out a step on a page the Verifier crossed out", () => {
    const html = render(STEPS);
    expect(html).not.toContain("A tidier wording");
    expect(html).not.toContain("Wording changes");
  });

  it("shows nothing when the step where it first appears is missing", () => {
    // Two steps on confirmed pages, but neither is where it first appears.
    expect(render([{ ...STEPS[0], change: "wording" }, STEPS[2]])).toBe("");
    // The first step is on a crossed-out page, so what's left starts mid-way.
    const fromCrossedOut: LineageStep[] = [{ ...STEPS[0], node: "n3" }, { ...STEPS[2], node: "n1" }, STEPS[2]];
    expect(render(fromCrossedOut)).toBe("");
  });

  it("shows nothing when only one step is left", () => {
    expect(render(STEPS.slice(0, 2))).toBe("");
    expect(render([])).toBe("");
  });
});
