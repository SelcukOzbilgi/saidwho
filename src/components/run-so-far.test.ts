import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun } from "../lib/run-state";
import { stepShare } from "./progress";
import { RunSoFar, searchMarks } from "./run-so-far";
import { Tick } from "./tick";

const spend = { tier: "super", costUsd: 0.001, usageKnown: true, latencyMs: 10 } as const;
const QUERIES = ['"A saying"', "a saying origin", "a saying Twain"];
const plan: RunEvent = { type: "planned", ...spend, variants: ["A sayin'"], candidateAuthors: ["Twain"], queries: QUERIES, foundAttribution: null };
const searched = (query: string, results: number): RunEvent => ({ type: "searched", query, results, credits: 1, latencyMs: 10 });
const run = (...events: RunEvent[]) => [plan, ...events].reduce(reduceRun, initialRunState);

describe("searchMarks", () => {
  it("ticks off each search the log says came back, with its result count, and marks the next one as under way", () => {
    const state = run(searched(QUERIES[0], 5), { type: "search_failed", query: QUERIES[1], reason: "timeout" });
    expect(searchMarks(QUERIES, state.log, true)).toEqual([
      { state: "done", results: 5 },
      { state: "failed", results: null },
      { state: "now", results: null },
    ]);
  });

  it("leaves a search that never ran waiting once the run has moved on", () => {
    const state = run(searched(QUERIES[0], 1), searched(QUERIES[1], 0));
    expect(searchMarks(QUERIES, state.log, false).map((mark) => mark.state)).toEqual(["done", "done", "waiting"]);
    expect(searchMarks(QUERIES, state.log, false)[0].results).toBe(1);
  });
});

describe("stepShare", () => {
  it("is the share of planned searches run, then of pages read, and null for a step with nothing to count", () => {
    expect(stepShare(run(searched(QUERIES[0], 5)))).toBeCloseTo(1 / 3);
    expect(stepShare({ ...initialRunState, phase: "reading", pages: 4, readUrls: ["a", "b"] })).toBe(0.5);
    expect(stepShare(initialRunState)).toBeNull();
    expect(stepShare({ ...initialRunState, phase: "judging" })).toBeNull();
  });
});

describe("RunSoFar", () => {
  it("shows the plan with the searches' results as text the server sends", () => {
    const state = run(searched(QUERIES[0], 5));
    const text = renderToStaticMarkup(createElement(RunSoFar, state))
      .replaceAll("&quot;", '"')
      .replace(/<[^>]+>/g, "");
    expect(text).toContain("Searching the web: 1 search done");
    expect(text).toContain('"A saying" 5 results');
    expect(text).toContain("Twain");
  });
});

describe("Tick", () => {
  it("sends the value once as plain text, in one piece", () => {
    const html = renderToStaticMarkup(createElement(Tick, { value: "$0.0072" }));
    expect(html).toContain('<span class="sr-only">$0.0072</span>');
    expect(html.replace(/<[^>]+>/g, "")).toBe("$0.0072");
    expect(renderToStaticMarkup(createElement(Tick, { value: 13 })).replace(/<[^>]+>/g, "")).toBe("13");
  });

  it("draws the rolling digits from an attribute, hidden from assistive tech", () => {
    const html = renderToStaticMarkup(createElement(Tick, { value: 16 }));
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*select-none/);
    expect(html.match(/data-char="(.)"/g)).toEqual(['data-char="1"', 'data-char="6"']);
  });
});
