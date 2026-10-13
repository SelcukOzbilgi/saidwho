import { describe, expect, it } from "vitest";

import { atBottom, jumpToEnd } from "./log-follow";

describe("atBottom", () => {
  it("counts a box scrolled to or near its end as at the bottom", () => {
    expect(atBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(atBottom({ scrollTop: 580, scrollHeight: 1000, clientHeight: 400 })).toBe(true);
    expect(atBottom({ scrollTop: 200, scrollHeight: 1000, clientHeight: 400 })).toBe(false);
  });
});

describe("jumpToEnd", () => {
  it("jumps on first showing, and when a run starts over", () => {
    expect(jumpToEnd({ shown: 0, length: 40, following: false })).toBe(true);
    expect(jumpToEnd({ shown: 40, length: 1, following: false })).toBe(true);
  });

  it("follows new lines only while the reader is at the bottom", () => {
    expect(jumpToEnd({ shown: 5, length: 6, following: true })).toBe(true);
    expect(jumpToEnd({ shown: 5, length: 6, following: false })).toBe(false);
  });
});
