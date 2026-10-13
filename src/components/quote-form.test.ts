import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuoteForm } from "./quote-form";

const render = (trialOpen: boolean) =>
  renderToStaticMarkup(createElement(QuoteForm, { trialOpen, running: false, onStart: () => {}, onStop: () => {} }));

describe("QuoteForm", () => {
  it("says what the disabled button is waiting for", () => {
    // With the trial off, the keys are what's missing, and the finished cases need none.
    expect(render(false)).toContain("Add both keys above to run it");
    expect(render(true)).toContain("Paste a quote to start.");
  });
});
