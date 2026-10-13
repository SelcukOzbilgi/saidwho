import { describe, expect, it } from "vitest";

import { renderIntro } from "./report";
import { EVAL_SETS, pickSet } from "./sets";

describe("pickSet", () => {
  it("runs the main set unless told otherwise", () => {
    expect(pickSet(null)).toBe(EVAL_SETS.main);
    expect(pickSet(["holdout"])).toBe(EVAL_SETS.holdout);
  });

  it("takes exactly one known set", () => {
    expect(() => pickSet(["main", "holdout"])).toThrow(/one set/);
    expect(() => pickSet(["heldout"])).toThrow(/no set called heldout/);
  });

  it("gives each set its own logs and results file, and keeps the main set's paths", () => {
    const sets = Object.values(EVAL_SETS);
    expect(new Set(sets.map((s) => s.runs)).size).toBe(sets.length);
    expect(new Set(sets.map((s) => s.results)).size).toBe(sets.length);
    expect(EVAL_SETS.main).toMatchObject({ file: "quotes.jsonl", runs: "eval", results: "results.md" });
  });
});

describe("renderIntro", () => {
  const setups = [{ label: "Cascade", about: "the app as it runs." }];

  it("names the set's own file and says when the runs were made", () => {
    const intro = renderIntro(EVAL_SETS.main, ["2026-10-13", "2026-10-12", "2026-10-13"], setups);
    expect(intro).toContain("from runs made from 2026-10-12 to 2026-10-13. Each quote in [quotes.jsonl](quotes.jsonl)");
    expect(intro).toContain("- Cascade: the app as it runs.");
    expect(intro).not.toContain("held-out");
  });

  it("says a held-out result comes from quotes the code was never tuned on", () => {
    const intro = renderIntro(EVAL_SETS.holdout, ["2026-10-14"], setups);
    expect(intro).toContain("This is the held-out set.");
    expect(intro).toContain("from runs made on 2026-10-14. Each quote in [holdout.jsonl](holdout.jsonl)");
  });
});
