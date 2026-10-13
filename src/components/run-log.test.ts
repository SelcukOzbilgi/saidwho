import { describe, expect, it } from "vitest";

import { callCost } from "./run-log";

describe("callCost", () => {
  it("never shows a paid call as free", () => {
    expect(callCost(0.00002)).toBe("<$0.0001");
    expect(callCost(0)).toBe("$0.0000");
    expect(callCost(0.0037)).toBe("$0.0037");
  });
});
