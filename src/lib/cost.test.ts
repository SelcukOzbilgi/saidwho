import { describe, expect, it } from "vitest";

import { ultraRatio } from "./cost";

describe("ultraRatio", () => {
  it("rounds to a whole number", () => {
    expect(ultraRatio(0.0072, 0.0431)).toBe(6);
    expect(ultraRatio(0.004, 0.036)).toBe(9);
    expect(ultraRatio(0.0035, 0.0179)).toBe(5);
  });

  it("says nothing when Ultra's figure is unknown or the run cost nothing", () => {
    expect(ultraRatio(0.0041, null)).toBeNull();
    expect(ultraRatio(0.0041, 0)).toBeNull();
    expect(ultraRatio(0, 0.03)).toBeNull();
  });

  it("says nothing when the gap is too small to mean anything", () => {
    expect(ultraRatio(0.03, 0.03)).toBeNull();
    expect(ultraRatio(0.02, 0.029)).toBeNull();
    expect(ultraRatio(0.02, 0.03)).toBe(2);
  });
});
