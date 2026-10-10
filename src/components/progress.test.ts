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
});
