import { describe, expect, it } from "vitest";

import { codeLabel, describeCode } from "./fingerprint";

describe("describeCode", () => {
  const clean = { commit: "603995a", changes: null };
  const dirty = { commit: "603995a", changes: "1a2b3c4d" };
  const otherDirty = { commit: "603995a", changes: "9f8e7d6c" };

  it("names one commit once", () => {
    expect(describeCode([clean, clean])).toBe("603995a");
    expect(codeLabel(dirty)).toBe("603995a-dirty-1a2b3c4d");
  });

  it("tells apart two different sets of changes on the same commit", () => {
    expect(describeCode([dirty, otherDirty])).toBe("603995a-dirty-1a2b3c4d (1), 603995a-dirty-9f8e7d6c (1)");
  });

  it("counts each label when runs came from different code, logs without a commit included", () => {
    expect(describeCode([clean, dirty, null, clean])).toBe("603995a (2), 603995a-dirty-1a2b3c4d (1), not recorded (1)");
    expect(describeCode([null])).toBe("not recorded");
    expect(describeCode([])).toBe("-");
  });
});
