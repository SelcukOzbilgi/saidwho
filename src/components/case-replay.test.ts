import { describe, expect, it } from "vitest";

import { replayStep, shownAt } from "./case-replay";

describe("replayStep", () => {
  it("spreads a replay over about twelve seconds, within limits", () => {
    expect(replayStep(48)).toBe(250);
    // A short log doesn't rush, and a long one doesn't drag.
    expect(replayStep(10)).toBe(400);
    expect(replayStep(1000)).toBe(60);
  });
});

describe("shownAt", () => {
  it("maps a point on the replay bar to how many events are shown", () => {
    expect(shownAt(0.5, 40)).toBe(20);
    expect(shownAt(1, 40)).toBe(40);
  });

  it("always keeps the first event, so the quote stays, and never runs past the last", () => {
    expect(shownAt(0, 40)).toBe(1);
    expect(shownAt(-0.2, 40)).toBe(1);
    expect(shownAt(1.3, 40)).toBe(40);
  });
});
