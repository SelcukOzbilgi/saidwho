import { describe, expect, it } from "vitest";

import { selectPassages } from "./passages";
import { cleanDate, judgeOutputSchema } from "./schemas";
import { toStrictJsonSchema } from "./structured";
import { checkSnippet, normalizeText } from "./verifier";

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

  it("falls back to the start of the page when no keyword appears", () => {
    const page = "x ".repeat(10_000);
    expect(selectPassages(page, ["insanity"], 100)).toBe(page.slice(0, 100));
  });
});

describe("cleanDate", () => {
  it("keeps partial ISO dates and pulls the year out of prose", () => {
    expect(cleanDate("1981-10")).toBe("1981-10");
    expect(cleanDate("October 11, 1981")).toBe("1981");
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
