import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { roughTime, RunPreview, typicalRun } from "./run-preview";

const text = (html: string) => html.replace(/<[^>]+>/g, "");
const render = (props: Partial<Parameters<typeof RunPreview>[0]> = {}) =>
  renderToStaticMarkup(createElement(RunPreview, { quote: "", credit: "", language: null, typical: null, ...props }));

describe("typicalRun", () => {
  it("takes the lowest and highest time and cost, leaving out runs without either", () => {
    const runs = [
      { seconds: 39, nebiusUsd: 0.0072 },
      { seconds: 183, nebiusUsd: 0.0047 },
      { seconds: null, nebiusUsd: 0.01 },
      { seconds: 12, nebiusUsd: 0 },
    ];
    expect(typicalRun(runs)).toEqual({ seconds: [39, 183], usd: [0.0047, 0.0072] });
    expect(typicalRun([])).toBeNull();
  });

  it("says a time the way it would be said", () => {
    expect([roughTime(29), roughTime(52), roughTime(183), roughTime(4)]).toEqual(["30 s", "50 s", "3 min", "10 s"]);
  });
});

describe("RunPreview", () => {
  it("shows what was typed, and keeps the run's answers for after the run", () => {
    const html = render({ quote: "  Be the change.  ", credit: "Mahatma Gandhi", language: { code: "en", name: "English" } });
    expect(text(html)).toContain("“Be the change.”");
    expect(text(html)).toContain("Usually credited to Mahatma Gandhi");
    expect(html).toContain('lang="en"');
    expect(text(html)).toContain("English");
    expect(html.match(/After the run/g)).toHaveLength(3);
  });

  it("asks for the quote while there is none, and says the saved runs' range when it has one", () => {
    const html = render({ typical: { seconds: [29, 183], usd: [0.0042, 0.0072] } });
    expect(text(html)).toContain("Your quote shows here as you type it.");
    expect(text(html)).toContain("Credited to whoever the pages name");
    expect(text(html)).toContain("Saved runs took 30 s to 3 min, $0.004 to $0.007 on Nebius.");
  });
});
