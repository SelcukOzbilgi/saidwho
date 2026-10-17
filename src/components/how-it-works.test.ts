import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CASCADE } from "../agent/models";
import { TRACE_ROUNDS } from "../agent/orchestrator";
import { CASES } from "../cases/cases";
import { checkerRejections } from "../cases/checker-rejections";
import { MODEL_NAME } from "../lib/model-name";
import { HowItWorks, STEPS } from "./how-it-works";
import { playTimes, stepAnchor } from "./run-map";

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const render = (rejections = checkerRejections(CASES)) =>
  renderToStaticMarkup(createElement(HowItWorks, { rejections, cases: CASES.length }));

describe("HowItWorks", () => {
  it("names the six steps in the order a run takes them", () => {
    expect(STEPS.map((s) => s.name)).toEqual(["Planner", "Search", "Readers", "Checker", "Genealogist", "Judge"]);
  });

  it("puts each step on the model the cascade gives it", () => {
    const model = Object.fromEntries(STEPS.map((s) => [s.name, s.model]));
    expect(model.Planner).toEqual({ first: CASCADE.plan.tier });
    expect(model.Readers).toEqual({ first: CASCADE.read.tier, retry: CASCADE.reread.tier });
    expect(model.Genealogist).toEqual({ first: CASCADE.trace.tier });
    expect(model.Judge).toEqual({ first: CASCADE.judge.tier, retry: CASCADE.rejudge.tier });
    expect(model.Search).toBeUndefined();
    expect(model.Checker).toBeUndefined();
    const html = render();
    for (const tier of new Set(STEPS.flatMap((s) => (s.model ? [s.model.first, s.model.retry] : [])))) {
      if (tier) expect(html).toContain(MODEL_NAME[tier]);
    }
  });

  it("says how many snippets the Checker turned down and links to a crossed-out card", () => {
    const counts = checkerRejections(CASES);
    const html = render(counts);
    expect(text(html)).toContain(
      `In the ${CASES.length} saved cases it turned down ${counts.rejected} snippets. ${counts.rescued} passed when ${MODEL_NAME[CASCADE.reread.tier]} read the page again, and ${counts.crossedOut} stay crossed out, like this one.`,
    );
    expect(html).toContain(`href="/cases/${counts.example!.caseId}#node-${counts.example!.nodeId}"`);
  });

  it("leaves the count out when nothing was turned down, and the link when nothing stayed crossed out", () => {
    expect(text(render({ rejected: 0, rescued: 0, crossedOut: 0, example: null }))).not.toContain("turned down");
    const one = text(render({ rejected: 1, rescued: 1, crossedOut: 0, example: null }));
    expect(one).toContain("turned down 1 snippet. 1 passed when");
    expect(one).not.toContain("like this one");
  });

  it("shows the crossed-out snippet the counts link to, from its saved case, and none without one", () => {
    const counts = checkerRejections(CASES);
    const found = CASES.find((c) => c.caseId === counts.example!.caseId)!;
    const node = found.run.nodes.find((n) => n.id === counts.example!.nodeId)!;
    const shown = text(render(counts));
    expect(shown).toContain(node.reader.exact_snippet!.slice(0, 40));
    expect(shown).toContain(`Crossed out in the case for “${found.run.quote}”: a sentence a Reader copied from ${node.host}.`);
    expect(text(render({ ...counts, example: null }))).not.toContain("Crossed out in the case");
  });

  it("says the Genealogist loops back to the Readers for as many rounds as the orchestrator allows", () => {
    expect(text(render())).toContain(`Back to the Readers, up to ${TRACE_ROUNDS} rounds`);
  });

  it("plays the steps on the map in the order a run takes them, going round the loop before the Judge", () => {
    const { times, loopAt } = playTimes(STEPS, TRACE_ROUNDS);
    for (let i = 1; i < times.length; i++) expect(times[i].start).toBeGreaterThan(times[i - 1].done);
    const at = (name: string) => times[STEPS.findIndex((s) => s.name === name)];
    expect(loopAt).toBeGreaterThan(at("Genealogist").done);
    expect(at("Judge").start).toBeGreaterThan(loopAt);
    // More rounds take longer to go round.
    expect(playTimes(STEPS, TRACE_ROUNDS + 1).times.at(-1)!.start).toBeGreaterThan(at("Judge").start);
  });

  it("tells the map how long its play takes, so it can be marked done after the Judge", () => {
    const { times, end } = playTimes(STEPS, TRACE_ROUNDS);
    const playFor = Number(render().match(/data-play-for="(\d+)"/)![1]);
    expect(end).toBeGreaterThan(times.at(-1)!.done);
    expect(playFor).toBeGreaterThan(end);
  });

  it("links each step on the map to what the list says about it", () => {
    const html = render();
    for (const step of STEPS) {
      expect(html).toContain(`href="#${stepAnchor(step.name)}"`);
      expect(html).toContain(`id="${stepAnchor(step.name)}"`);
    }
  });

  it("throws the start of the crossed-out snippet out of the Checker on the map, and none without one", () => {
    const counts = checkerRejections(CASES);
    const found = CASES.find((c) => c.caseId === counts.example!.caseId)!;
    const snippet = found.run.nodes.find((n) => n.id === counts.example!.nodeId)!.reader.exact_snippet!.trim();
    const html = render(counts);
    const shown = html.match(/<s class="strike[^"]*">“([^”]+)”<\/s>/)![1];
    expect(shown.endsWith("…")).toBe(true);
    expect(snippet.startsWith(shown.slice(0, -1))).toBe(true);
    expect(html).toContain(">thrown out</span>");
    expect(render({ ...counts, example: null })).not.toContain(">thrown out</span>");
  });
});

