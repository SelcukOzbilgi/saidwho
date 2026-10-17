import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CASES } from "../cases/cases";
import { KNOWN } from "../cases/known";
import { CaseGallery } from "./case-gallery";
import { knownMatch } from "./known-answer";

// One card's markup: from its link to the next card's.
const card = (html: string, caseId: string): string => {
  const start = html.indexOf(`href="/cases/${caseId}"`);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end);
};

describe("KNOWN", () => {
  it("has the test set's answer for every finished case", () => {
    for (const { caseId } of CASES) expect(KNOWN.has(caseId), caseId).toBe(true);
  });
});

describe("CaseGallery", () => {
  const html = renderToStaticMarkup(createElement(CaseGallery, { cases: CASES }));

  it("says on each card whether the run got the known answer", () => {
    for (const { caseId, run } of CASES) {
      const match = knownMatch(KNOWN.get(caseId)!, run.verdict?.output.verdict ?? null);
      const words = { same: "Matches the known answer", differs: "Differs from the known answer", none: "No verdict to compare" };
      expect(card(html, caseId), caseId).toContain(words[match]);
    }
  });

  it("marks the saved runs that missed as differing", () => {
    expect(card(html, "faster-horses")).toContain("Differs from the known answer");
    expect(card(html, "en-hakiki-mursit")).toContain("Differs from the known answer");
    expect(card(html, "so-much-owed")).toContain("Matches the known answer");
  });

  it("leaves the chip off a case the test set doesn't have", () => {
    const [first] = CASES;
    const stray = { ...first, caseId: "not-in-the-test-set" };
    const alone = renderToStaticMarkup(createElement(CaseGallery, { cases: [stray] }));
    expect(alone).not.toMatch(/Matches the known answer|Differs from the known answer|No verdict to compare/);
  });

  it("ships the cards in place, so they read the same without JavaScript", () => {
    expect(html).not.toMatch(/data-arrive=|opacity:\s*0/);
  });

  it("previews each run's earliest trace on its card, year first", () => {
    expect(card(html, "be-the-change")).toContain("Earliest trace: 1974, Arleen Lorrance");
    expect(card(html, "so-much-owed")).toContain("Earliest trace: 1940, Winston Churchill");
    // The Judge gave no author or year for this one, so there is nothing to preview.
    expect(card(html, "gel-ne-olursan-ol")).not.toContain("Earliest trace");
    // A year with no author says where it was seen, as the case page does.
    expect(card(html, "en-hakiki-mursit")).toContain("Earliest trace: 2019, via ackizyurdu.com");
    // A bare year would say less than the figures, so they stay.
    expect(card(html, "faster-horses")).not.toContain("Earliest trace");
  });
});
