import { describe, expect, it } from "vitest";

import type { EvidenceNode } from "./events";
import { canonicalId, checkVerdict, retryNote } from "./judge-check";
import { type JudgeOutput, MAX_JUDGE_FIELD_CHARS, MAX_RATIONALE_CHARS } from "./schemas";

const node = (id: string, dates: { pageDate?: string; citedSourceDate?: string } = {}): EvidenceNode => {
  const pageDate = dates.pageDate ?? null;
  const citedSourceDate = dates.citedSourceDate ?? null;
  return {
    id,
    url: `https://example.org/${id}`,
    host: "example.org",
    title: `Page ${id}`,
    check: { status: "exact", score: 1 },
    reader: {
      contains_quote: true,
      exact_snippet: "A saying.",
      attributed_to: null,
      page_date: pageDate,
      cited_source: null,
      cited_source_date: citedSourceDate,
    },
    attributedTo: null,
    pageDate,
    citedSourceDate,
    date: citedSourceDate ?? pageDate,
    foundVia: null,
  };
};

const VERDICT: JudgeOutput = {
  rationale: "A 1950 page has it [n1].",
  verdict: "no_known_source",
  confidence: "medium",
  earliest_node: "n1",
  earliest_author: null,
  earliest_date: "1950",
  misattribution_node: null,
  lineage: [{ node: "n1", change: "first", note: "It first appears here." }],
};

const PAGES = [node("n1", { pageDate: "1950" }), node("n2", { pageDate: "2010", citedSourceDate: "1931" }), node("n3")];

describe("canonicalId", () => {
  it("takes the id out of brackets, quotes and emphasis", () => {
    for (const raw of ["n8", "[n8]", "[[n8]]", "(n8)", '"n8"', "**n8**", " N8 "]) expect(canonicalId(raw)).toEqual({ id: "n8" });
  });

  it("reads null and its spellings as no id", () => {
    for (const raw of [null, "null", "[null]", "None", "", "n/a"]) expect(canonicalId(raw)).toEqual({ id: null });
  });

  it("keeps lists and ranges as they are, marked as not one id", () => {
    for (const raw of ["n1–n7, n15", "n1, n2", "n1-n3", "[n1] [n2]", "node 3", "3"]) expect(canonicalId(raw)).toEqual({ malformed: raw });
  });
});

describe("checkVerdict", () => {
  it("lets a clean verdict through unchanged", () => {
    expect(checkVerdict(VERDICT, PAGES)).toEqual({ verdict: VERDICT, unknownIds: [], fixes: [] });
  });

  it("tidies wrapped ids in the id fields and the lineage", () => {
    const raw = { ...VERDICT, earliest_node: "[n1]", misattribution_node: "null", lineage: [{ ...VERDICT.lineage![0], node: "[n1]" }] };
    const { verdict, unknownIds } = checkVerdict(raw, PAGES);
    expect(unknownIds).toEqual([]);
    expect(verdict).toMatchObject({ earliest_node: "n1", misattribution_node: null, lineage: [{ node: "n1" }] });
  });

  it("counts a list or range in an id field against the verdict", () => {
    expect(checkVerdict({ ...VERDICT, misattribution_node: "n1–n3, n7" }, PAGES).unknownIds).toEqual(["n1–n3, n7"]);
  });

  it("counts ids that aren't confirmed pages, wherever they are cited", () => {
    const raw = {
      ...VERDICT,
      misattribution_node: "n9",
      rationale: "See [n1, n8].",
      lineage: [...VERDICT.lineage!, { node: "n7", change: "credit" as const, note: "Credited after [n6]." }],
    };
    const { verdict, unknownIds } = checkVerdict(raw, PAGES);
    expect(unknownIds.sort()).toEqual(["n6", "n7", "n8", "n9"]);
    expect(verdict.lineage?.map((s) => s.node)).toEqual(["n1"]);
  });

  it("drops a lineage step with no page", () => {
    const raw = { ...VERDICT, lineage: [...VERDICT.lineage!, { node: "null", change: "wording" as const, note: "Reworded." }] };
    expect(checkVerdict(raw, PAGES)).toMatchObject({ unknownIds: [], verdict: { lineage: VERDICT.lineage } });
  });

  it("accepts an earliest date that is the named page's cited source date", () => {
    expect(checkVerdict({ ...VERDICT, earliest_node: "n2", earliest_date: "1931-05" }, PAGES).fixes).toEqual([]);
  });

  it("names the confirmed page that gives the earliest year when the named one doesn't", () => {
    const { verdict, fixes } = checkVerdict({ ...VERDICT, earliest_node: "n3", earliest_date: "1931" }, PAGES);
    expect(verdict).toMatchObject({ earliest_node: "n2", earliest_date: "1931" });
    expect(fixes).toEqual(["named n2 as the earliest page instead of n3: n2 gives 1931 and n3 doesn't"]);
  });

  it("names a page for a date given with no page", () => {
    const { verdict, fixes } = checkVerdict({ ...VERDICT, earliest_node: null, earliest_date: "1950" }, PAGES);
    expect(verdict.earliest_node).toBe("n1");
    expect(fixes).toEqual(["named n1 as the earliest page, since it gives 1950"]);
  });

  it("prefers a page the timeline puts in that year", () => {
    const pages = [node("n1", { pageDate: "1931", citedSourceDate: "1900" }), node("n2", { citedSourceDate: "1931" })];
    const both = { ...VERDICT, rationale: "Two pages have it [n1, n2].", earliest_node: null, earliest_date: "1931" };
    expect(checkVerdict(both, pages).verdict.earliest_node).toBe("n2");
  });

  it("looks first among the pages the verdict cites", () => {
    const pages = [node("n1", { pageDate: "1931" }), node("n2", { citedSourceDate: "1931" })];
    const citesTwo = { ...VERDICT, rationale: "A page cites a 1931 source [n2].", earliest_node: null, earliest_date: "1931", lineage: [] };
    expect(checkVerdict(citesTwo, pages).verdict.earliest_node).toBe("n2");
  });

  it("counts page ids in parentheses or on their own as cited", () => {
    for (const rationale of ["The source is (n99).", "The source is n99.", "The source is [N99]."]) {
      expect(checkVerdict({ ...VERDICT, rationale }, PAGES).unknownIds).toEqual(["n99"]);
    }
  });

  it("cuts an over-long author name", () => {
    const author = checkVerdict({ ...VERDICT, earliest_author: "X".repeat(500) }, PAGES).verdict.earliest_author;
    expect(author).toHaveLength(MAX_JUDGE_FIELD_CHARS);
  });

  it("leaves out an earliest date no confirmed page gives, and keeps the page", () => {
    const { verdict, fixes, unknownIds } = checkVerdict({ ...VERDICT, earliest_date: "1765" }, PAGES);
    expect(verdict).toMatchObject({ earliest_node: "n1", earliest_date: null });
    expect(fixes).toEqual(["left out the earliest date 1765: no confirmed page gives 1765"]);
    expect(unknownIds).toEqual([]);
  });

  it("cleans the earliest date and drops one with no year", () => {
    expect(checkVerdict({ ...VERDICT, earliest_date: "circa 1950" }, PAGES).verdict.earliest_date).toBe("1950");
    expect(checkVerdict({ ...VERDICT, earliest_date: "null" }, PAGES).verdict.earliest_date).toBeNull();
  });

  it("cuts an over-long rationale at a sentence end", () => {
    const sentence = "This page has it [n1]. ";
    const rationale = sentence.repeat(Math.ceil(MAX_RATIONALE_CHARS / sentence.length) + 5);
    const cut = checkVerdict({ ...VERDICT, rationale }, PAGES).verdict.rationale;
    expect(cut.length).toBeLessThanOrEqual(MAX_RATIONALE_CHARS);
    expect(cut.endsWith("[n1].")).toBe(true);
  });

  it("fills in an empty lineage for a verdict given without one", () => {
    const { lineage, ...compact } = VERDICT;
    void lineage;
    expect(checkVerdict(compact, PAGES).verdict.lineage).toEqual([]);
  });
});

describe("retryNote", () => {
  it("says what was wrong and lists the ids to use", () => {
    expect(retryNote(["n9", "n1–n3"], ["n1", "n2"])).toBe(
      'Your last verdict was set aside: n9 is not one of the confirmed pages; "n1–n3" is not a single page id. ' +
        "Cite only these page ids, written exactly like this: n1, n2. " +
        'Each id field takes one id or null (not the string "null"), never brackets, a list or a range.',
    );
  });
});
