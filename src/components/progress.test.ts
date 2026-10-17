import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { initialRunState } from "../lib/run-state";
import { Progress } from "./progress";

const render = (ultraUsd: number | null) =>
  renderToStaticMarkup(
    createElement(Progress, { ...initialRunState, nebiusUsd: 0.0041, ultraUsd, tavilyCredits: 5, running: false }),
  ).replace(/<[^>]+>/g, "");

describe("Progress", () => {
  it("shows the same calls at Ultra prices only when every call's token counts are known", () => {
    expect(render(0.0389)).toContain("$0.0041 on Nebius (same calls at Ultra prices: $0.0389) · 5 Tavily credits");
    expect(render(null)).toContain("$0.0041 on Nebius · 5 Tavily credits");
    expect(render(null)).not.toContain("Ultra");
  });

  it("says how much cheaper the run was than the same calls at Ultra prices, once it has finished", () => {
    const at = (finished: boolean, ultraUsd: number | null) =>
      renderToStaticMarkup(
        createElement(Progress, { ...initialRunState, finished, nebiusUsd: 0.0072, ultraUsd, running: false }),
      ).replace(/<[^>]+>/g, "");
    expect(at(true, 0.0433)).toContain("About 6x cheaper than the same calls at Nemotron 3 Ultra prices");
    expect(at(false, 0.0433)).not.toContain("cheaper");
    expect(at(true, null)).not.toContain("cheaper");
  });

  it("says one page, not one pages", () => {
    const text = renderToStaticMarkup(
      createElement(Progress, {
        ...initialRunState,
        phase: "judging",
        pages: 1,
        readUrls: ["https://a.org"],
        leads: [{ round: 1, fromNode: "n1", work: "Confessions", query: "q" }],
        nodes: [],
        running: false,
      }),
    ).replace(/<[^>]+>/g, "");
    expect(text).toContain("1 of 1 page, 0 confirmed");
    expect(text).toContain("1 cited work, 0 pages found");
  });
});
