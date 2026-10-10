import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuoteForm } from "./quote-form";

const render = (trialOpen: boolean, savesRuns = false) =>
  renderToStaticMarkup(createElement(QuoteForm, { trialOpen, savesRuns, running: false, onStart: () => {}, onStop: () => {} }));

describe("QuoteForm", () => {
  it("says what the disabled button is waiting for", () => {
    // With the trial off, the keys are what's missing, and the finished cases need none.
    expect(render(false)).toContain("Add both keys above to run it");
    expect(render(true)).toContain("Paste a quote to start.");
  });

  it("says runs are saved only when they are", () => {
    expect(render(true)).not.toContain("Every run is saved");
    expect(render(true, true)).toContain("Every run is saved and gets a public link");
  });
});
