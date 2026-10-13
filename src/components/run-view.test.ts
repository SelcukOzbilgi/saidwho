import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun } from "../lib/run-state";
import { RunView } from "./run-view";

const spend = { tier: "super", costUsd: 0.001, usageKnown: true, latencyMs: 10 } as const;
const started = (popularAttribution: string | null): RunEvent => ({
  type: "started",
  quote: "Be the change you wish to see in the world.",
  popularAttribution,
  language: "en",
  excludeDomains: [],
});
const planned = (foundAttribution: string | null): RunEvent => ({
  type: "planned",
  ...spend,
  variants: [],
  candidateAuthors: [],
  queries: ["q"],
  foundAttribution,
});

const plan: RunEvent = {
  type: "planned",
  ...spend,
  variants: ["Be the change"],
  candidateAuthors: [],
  queries: ["first search", "second search"],
  foundAttribution: null,
};
const finish: RunEvent = { type: "done", nebiusUsd: 0.002, tavilyCredits: 2, unknownCostCalls: 0, seconds: 9 };

const render = (events: RunEvent[], running = true) =>
  renderToStaticMarkup(createElement(RunView, { run: events.reduce(reduceRun, initialRunState), running }))
    .replaceAll("&#x27;", "'")
    .replace(/<[^>]+>/g, "");

describe("RunView", () => {
  it("says where the usual credit came from", () => {
    expect(render([started("Mahatma Gandhi")])).toContain("Usually credited to Mahatma Gandhi");
    expect(render([started(null)])).toContain("No name was given, so the planner will say who it's usually credited to.");
    expect(render([started(null), planned("Mahatma Gandhi")])).toContain(
      "No name was given. The planner says it's usually credited to Mahatma Gandhi.",
    );
    expect(render([started(null), planned(null)], false)).toContain("No name was given, and the planner didn't name anyone.");
  });

  it("marks the quote's language, and makes it the heading only when asked", () => {
    const run = [{ ...started("Mevlana"), language: "tr" } as RunEvent].reduce(reduceRun, initialRunState);
    const html = (quoteIsHeading: boolean) =>
      renderToStaticMarkup(createElement(RunView, { run, running: false, quoteIsHeading }));
    expect(html(true)).toMatch(/<h1 lang="tr"[^>]*>“Be the change/);
    expect(html(false)).toMatch(/<blockquote lang="tr"/);
    expect(html(false)).not.toContain("<h1");
  });

  it("reads log lines aloud only when asked", () => {
    const run = [started("Mahatma Gandhi")].reduce(reduceRun, initialRunState);
    const html = (announce: boolean) => renderToStaticMarkup(createElement(RunView, { run, running: true, announce }));
    expect(html(true)).toContain('aria-live="polite"');
    expect(html(false)).toContain('aria-live="off"');
  });

  it("says each step aloud from the card when the log doesn't, as in a replay", () => {
    const run = [started("Mahatma Gandhi")].reduce(reduceRun, initialRunState);
    const html = (announce: boolean) => renderToStaticMarkup(createElement(RunView, { run, running: true, announce }));
    expect(html(false)).toMatch(/<span class="sr-only" aria-live="polite">Planning<\/span>/);
    expect(html(true)).not.toContain(">Planning</span>");
  });

  it("shows the run so far where the verdict will go, until there is one", () => {
    const early = render([started("Mahatma Gandhi")]);
    expect(early).toContain("Under way");
    expect(early).toContain("The Planner is choosing what to search for");
    const planning = render([started("Mahatma Gandhi"), plan]);
    expect(planning).toContain("second search");
    expect(planning).toContain("“Be the change”");
    const judged: RunEvent = {
      type: "verdict",
      ...spend,
      unknownIds: [],
      verdict: {
        verdict: "misattributed",
        confidence: "high",
        rationale: "No early page.",
        earliest_node: null,
        earliest_author: null,
        earliest_date: null,
        misattribution_node: null,
        lineage: [],
      },
    };
    const done = render([started("Mahatma Gandhi"), plan, judged, finish], false);
    expect(done).not.toContain("Under way");
    expect(done).toContain("Mahatma Gandhi probably didn't say it");
  });

  // Each way a run can end without a verdict, through the events or the page
  // state that really get it there. Something always stands in the verdict's
  // place, and the Planner's plan, which only shows progress, goes with the
  // card it was on; the log keeps "Planned 2 searches".
  it("says why there is no verdict, however the run ended", () => {
    const begun = [started("Mahatma Gandhi"), plan];
    const ended = (events: RunEvent[]) => {
      const text = render([...begun, ...events], false);
      expect(text).not.toContain("Under way");
      expect(text).not.toContain("second search");
      expect(text).toContain("Planned 2 searches");
      expect(text).toContain("No verdict");
      return text;
    };
    // Finished without one.
    expect(ended([finish])).toContain("The run ended before a verdict.");
    // The Judge failed, then the run finished.
    expect(ended([{ type: "judge_failed", ...spend, reason: "the provider timed out" }, finish])).toContain(
      "The provider timed out",
    );
    // Stopped at the spending limit.
    expect(ended([{ type: "budget_exceeded", spentUsd: 0.05, maxUsd: 0.05 }, finish])).toContain(
      "The run hit its spending limit first.",
    );
    // Stopped on the server.
    expect(ended([{ type: "aborted" }, finish])).toContain("The run was stopped before a verdict.");
    // Stopped by the visitor or cut off: the page stops the run with no more events.
    expect(ended([])).toContain("The run ended before a verdict.");
  });
});
