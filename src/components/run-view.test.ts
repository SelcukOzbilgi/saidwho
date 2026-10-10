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
});
