import { describe, expect, it } from "vitest";

import { plural } from "./plural";

describe("plural", () => {
  it("uses the single word only for one", () => {
    expect(plural(1, "page")).toBe("1 page");
    expect(plural(0, "page")).toBe("0 pages");
    expect(plural(16, "page")).toBe("16 pages");
  });

  it("takes an irregular plural", () => {
    expect(plural(1, "search", "searches")).toBe("1 search");
    expect(plural(5, "search", "searches")).toBe("5 searches");
  });
});
