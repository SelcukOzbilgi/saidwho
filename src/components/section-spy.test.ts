import { describe, expect, it } from "vitest";

import { pickSection } from "./section-spy";

const tops = (...values: number[]) => ["how-it-works", "eval", "cases"].map((id, i) => ({ id, top: values[i] }));

describe("pickSection", () => {
  it("marks no section while the intro is still above the reading line", () => {
    expect(pickSection(tops(500, 1400, 2200), 300, false)).toBeNull();
  });

  it("marks the last section whose top has passed the line", () => {
    expect(pickSection(tops(-900, 120, 900), 300, false)).toBe("eval");
    expect(pickSection(tops(-2000, -1100, 300), 300, false)).toBe("cases");
  });

  it("marks the last section at the bottom of the page, even if it never reached the line", () => {
    expect(pickSection(tops(-3000, -2000, 450), 300, true)).toBe("cases");
  });

  it("marks nothing on a page without the sections", () => {
    expect(pickSection([], 300, true)).toBeNull();
  });
});
