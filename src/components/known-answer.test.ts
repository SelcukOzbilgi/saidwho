import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EvalCase } from "../eval/cases";
import { KnownAnswer } from "./known-answer";

const known: EvalCase = {
  id: "faster-horses",
  quote: "If I had asked people what they wanted, they would have said faster horses.",
  language: "en",
  popular_attribution: "Henry Ford",
  verdict: "no_known_source",
  earliest: { author: "John McNeece", work: "An interview", date: "1999", wording: null },
  misattribution_first_seen: null,
  references: ["https://quoteinvestigator.com/2011/07/28/ford-faster-horse/"],
  notes: "Notes.",
};

const render = (verdict: EvalCase["verdict"]) =>
  renderToStaticMarkup(createElement(KnownAnswer, { known: { ...known, verdict }, reached: "misattributed" }));

describe("KnownAnswer", () => {
  it("says whose credit the verdict is about, so an earliest trace doesn't contradict it", () => {
    const html = render("no_known_source");
    expect(html).toContain("No known source for Henry Ford");
    expect(html).toContain("Earliest known: An interview, by John McNeece, 1999.");
  });

  it("names the credit for every verdict", () => {
    expect(render("misattributed")).toContain("Misattributed to Henry Ford");
    expect(render("correct")).toContain("Correctly credited to Henry Ford");
    expect(render("contested")).toContain("Credit to Henry Ford is contested");
  });
});
