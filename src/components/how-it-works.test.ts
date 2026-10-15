import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CASCADE } from "../agent/models";
import { CASES } from "../cases/cases";
import { checkerRejections } from "../cases/checker-rejections";
import { MODEL_NAME } from "../lib/model-name";
import { HowItWorks, STEPS } from "./how-it-works";

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
});
