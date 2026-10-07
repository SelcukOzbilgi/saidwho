import { describe, expect, it } from "vitest";

import { selectPassages } from "./passages";
import { cleanDate, judgeOutputSchema } from "./schemas";
import { toStrictJsonSchema } from "./structured";
import { checkSnippet, mentionsName, mentionsYear, normalizeText } from "./verifier";

const PAGE = `Knoxville News-Sentinel, October 11, 1981. At the Al-Anon meeting a speaker said:
“Insanity is doing the same thing over and over again, but expecting different results.”`;

describe("checkSnippet", () => {
  it("finds a snippet despite curly quotes, case and punctuation", () => {
    expect(checkSnippet('"insanity is doing the same thing over and over again"', PAGE).status).toBe("exact");
  });

  it("accepts a near match with a small difference", () => {
    const result = checkSnippet("Insanity is doing the same thing over and over again but expecting different result", PAGE);
    expect(result.status).toBe("near");
    expect(result.score).toBeGreaterThanOrEqual(0.8);
  });

  it("rejects an invented passage", () => {
    expect(checkSnippet("Insanity, said Einstein, is repeating yourself and hoping for change", PAGE).status).toBe("not_found");
  });

  it("does not match across word boundaries", () => {
    expect(checkSnippet("anon meet", PAGE).status).toBe("not_found");
  });

  it("rejects short snippets that only partly match", () => {
    expect(checkSnippet("the same idea", PAGE).status).toBe("not_found");
  });

  it("rejects a real passage with an invented attribution in front", () => {
    const snippet = "Einstein said insanity is doing the same thing over and over again but expecting different results";
    expect(checkSnippet(snippet, PAGE).status).toBe("not_found");
  });

  it("allows one missing word in the middle of a long snippet", () => {
    const snippet = "Insanity is doing the same thing over and over but expecting different results";
    expect(checkSnippet(snippet, PAGE).status).toBe("near");
  });

  it("rejects a snippet stitched together from scattered parts of the page", () => {
    const page = "insanity is doing filler words here. the same thing more filler. over and over again end.";
    expect(checkSnippet("insanity is doing the same thing over and over again", page).status).toBe("not_found");
  });

  it("matches Turkish I and ı regardless of case", () => {
    expect(checkSnippet("akıl", "AKIL").status).toBe("exact");
  });

  it("treats Turkish letters the same way on both sides", () => {
    expect(normalizeText("Gel, gel, ne olursan ol YİNE gel")).toBe("gel gel ne olursan ol yine gel");
    expect(checkSnippet("ne olursan ol yine gel", "“Gel, gel, ne olursan ol yine gel”").status).toBe("exact");
  });
});

describe("selectPassages", () => {
  it("returns a short page unchanged", () => {
    expect(selectPassages(PAGE, ["insanity"], 10_000)).toBe(PAGE);
  });

  it("keeps the window that mentions the quote from a long page", () => {
    const filler = "lorem ipsum dolor sit amet ".repeat(4_000);
    const page = `${filler}${PAGE}${filler}`;
    const out = selectPassages(page, ["Insanity is doing the same thing over and over again"], 3_000);
    expect(out.length).toBeLessThanOrEqual(3_100);
    expect(out).toContain("Al-Anon meeting");
    expect(checkSnippet("doing the same thing over and over again", page).status).toBe("exact");
  });

  it("keeps offsets right when lowercasing changes the text length", () => {
    const page = `${"İ ".repeat(2_000)}${"x ".repeat(1_000)}uniquequotation ${"x ".repeat(3_000)}`;
    expect(selectPassages(page, ["uniquequotation"], 1_500)).toContain("uniquequotation");
  });

  it("returns a smaller window when the budget is below one window", () => {
    const out = selectPassages(`insanity ${"x ".repeat(2_000)}`, ["insanity"], 1_000);
    expect(out).toContain("insanity");
    expect(out.length).toBeLessThanOrEqual(1_000);
  });

  it("keeps the top of a long page, where dates and bylines usually are", () => {
    const page = `Published 11 October 1981 by the Knoxville News-Sentinel. ${"x ".repeat(5_000)}${PAGE}${"x ".repeat(5_000)}`;
    const out = selectPassages(page, ["insanity is doing the same thing"], 3_000);
    expect(out).toContain("Published 11 October 1981");
    expect(out).toContain("Al-Anon meeting");
  });

  it("falls back to the start of the page when no keyword appears", () => {
    const page = "x ".repeat(10_000);
    expect(selectPassages(page, ["insanity"], 100)).toBe(page.slice(0, 100));
  });
});

describe("cleanDate", () => {
  it("keeps partial ISO dates and pulls the year out of prose", () => {
    expect(cleanDate("1981-10")).toBe("1981-10");
    expect(cleanDate("October 11, 1981")).toBe("1981");
    expect(cleanDate("1981-02-30")).toBe("1981");
    expect(cleanDate("1981-99-99")).toBe("1981");
    expect(cleanDate("unknown")).toBeNull();
    expect(cleanDate(null)).toBeNull();
  });
});

describe("toStrictJsonSchema", () => {
  it("marks every field required and closes the object", () => {
    const schema = toStrictJsonSchema(judgeOutputSchema) as { required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual(Object.keys(judgeOutputSchema.shape).sort());
    expect(schema).not.toHaveProperty("$schema");
  });
});

describe("mentionsName and mentionsYear", () => {
  it("keeps a credit only when the page names that person", () => {
    expect(mentionsName("Rita Mae Brown", "a line from Rita Mae Brown's novel")).toBe(true);
    expect(mentionsName("Albert Einstein", "often credited to Einstein")).toBe(true);
    expect(mentionsName("Albert Einstein", PAGE)).toBe(false);
    expect(mentionsName("Rita Mae Brown (via a character)", "by Brown, 1983")).toBe(true);
  });

  it("keeps a date only when its year appears on the page", () => {
    expect(mentionsYear("1981-10-11", PAGE)).toBe(true);
    expect(mentionsYear("1905", PAGE)).toBe(false);
    expect(mentionsYear("1981", "item 119812 in the archive")).toBe(false);
  });
});
