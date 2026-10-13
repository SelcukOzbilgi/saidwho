import { describe, expect, it } from "vitest";

import { selectPassages } from "./passages";
import { cleanDate, judgeOutputSchema } from "./schemas";
import { toStrictJsonSchema } from "./structured";
import { carriesSaying, checkSnippet, keepsCitedDate, keepsPageDate, matchSnippet, mentionsName, normalizeText } from "./verifier";

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

  it("never lets a negation change or disappear", () => {
    const page = "He said: I would never do the same thing over and over again and hope for change.";
    expect(checkSnippet("I would ever do the same thing over and over again and hope for change", page).status).toBe("not_found");
    const withNot = "We do not know who said it first, and the book from the archive says so plainly.";
    expect(checkSnippet("We do know who said it first, and the book from the archive says so plainly", withNot).status).toBe("not_found");
    expect(checkSnippet("We do not know who said it first, and the book from the archive says so plainly", withNot).status).toBe("exact");
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

  it("finds a snippet whose page glues footnote numbers to word ends", () => {
    const page = "The lantern burns brightest in the darkest hall12 of the old house3, the keeper wrote.";
    expect(checkSnippet("The lantern burns brightest in the darkest hall of the old house", page).status).toBe("exact");
    // Numbers that are part of the text stay: 640k is not "k" with a footnote.
    expect(checkSnippet("only k of memory", "only 640k of memory").status).toBe("not_found");
  });

  it("says where on the page a snippet matched, in words", () => {
    const page = "One two three. The lantern burns brightest in the darkest hall of the old stone house.";
    expect(matchSnippet("the lantern burns brightest", page).span).toEqual({ start: 3, end: 7 });
    // One page word left out, so the match is near; its span still covers the
    // page's whole run.
    const near = matchSnippet("The lantern burns brightest in the darkest hall of the old house", page);
    expect(near).toMatchObject({ status: "near", span: { start: 3, end: 16 } });
    expect(matchSnippet("a candle in the window", page).span).toBeNull();
  });
});

describe("carriesSaying", () => {
  const SAYING = "The lantern burns brightest in the darkest hall of the old house";

  it("accepts the saying alone, inside a longer sentence, or in a known wording", () => {
    expect(carriesSaying("the lantern burns brightest in the darkest hall of the old house", [SAYING])).toBe(true);
    expect(carriesSaying(`As my grandmother liked to say, "${SAYING}," and she meant it.`, [SAYING])).toBe(true);
    expect(carriesSaying("A lamp shines brightest in the darkest room", [SAYING, "A lamp shines brightest in the darkest room"])).toBe(true);
  });

  it("accepts a part of a long saying, and a lightly changed wording", () => {
    expect(carriesSaying("burns brightest in the darkest hall", [SAYING])).toBe(true);
    expect(carriesSaying("The lanterns burn brightest in the darkest halls", [SAYING])).toBe(true);
  });

  it("rejects a sentence that only names or circles the saying", () => {
    expect(carriesSaying("Finally,", [SAYING])).toBe(false);
    expect(carriesSaying("This line about a lantern is often credited to a famous poet.", [SAYING])).toBe(false);
    expect(carriesSaying("The old house was quiet.", [SAYING])).toBe(false);
  });

  it("matches a saying made only of small words on all its words", () => {
    expect(carriesSaying('He shrugged and said, "It is what it is."', ["It is what it is"])).toBe(true);
    expect(carriesSaying("He shrugged.", ["It is what it is"])).toBe(false);
  });

  it("lets one snippet word stand for only one word of the saying", () => {
    expect(carriesSaying("Love", ["Live, love, laugh"])).toBe(false);
    expect(carriesSaying("Live and love", ["Live, love, laugh"])).toBe(true);
  });

  it("accepts a translation only when the run knows that wording, notes in brackets aside", () => {
    const french = "La lanterne brille le plus dans la salle la plus sombre";
    expect(carriesSaying(french, [SAYING])).toBe(false);
    expect(carriesSaying(french, [SAYING, `${french} (French version, as printed in an old almanac)`])).toBe(true);
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

  it("covers text just past the page top", () => {
    const page = `${"y".repeat(600)} uniquequotation ${"x ".repeat(5_000)}`;
    expect(selectPassages(page, ["uniquequotation"], 3_000)).toContain("uniquequotation");
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

describe("mentionsName", () => {
  it("keeps a credit only when the page names that person", () => {
    expect(mentionsName("Rita Mae Brown", "a line from Rita Mae Brown's novel")).toBe(true);
    expect(mentionsName("Albert Einstein", "often credited to Einstein")).toBe(true);
    expect(mentionsName("Albert Einstein", PAGE)).toBe(false);
    expect(mentionsName("Rita Mae Brown (via a character)", "by Brown, 1983")).toBe(true);
  });
});

describe("keepsPageDate and keepsCitedDate", () => {
  const filler = (words: number) => Array.from({ length: words }, () => "lorem").join(" ");
  // The snippet sits after 400 words, and other years sit far from it.
  const text = `${filler(400)} In 1950 he wrote: the lantern burns brightest. ${filler(100)} A song from 1890 was also popular. ${filler(100)} Sources: Old Almanac 1872.`;
  const span = matchSnippet("the lantern burns brightest", text).span;

  it("keeps a page date in the title, near the top, or next to the snippet", () => {
    expect(keepsPageDate("2014-05-02", { title: "Lanterns (2014)", text }, span)).toBe(true);
    expect(keepsPageDate("2014", { title: "Lanterns", text: `Posted May 2, 2014. ${text}` }, span)).toBe(true);
    expect(keepsPageDate("1950", { title: "Lanterns", text }, span)).toBe(true);
  });

  it("places a close match's span so a date at the window's edge still counts", () => {
    const page = `${filler(400)} 1906 ${filler(29)} the lantern burns brightest in the darkest hall of the old stone house`;
    const near = matchSnippet("the lantern burns brightest in the darkest hall of the old house", page);
    expect(near.status).toBe("near");
    expect(keepsPageDate("1906", { title: "Lanterns", text: page }, near.span)).toBe(true);
  });

  it("drops a page date whose year only turns up elsewhere on the page", () => {
    expect(keepsPageDate("1890", { title: "Lanterns", text }, span)).toBe(false);
    expect(keepsPageDate("1905", { title: "Lanterns", text }, span)).toBe(false);
    expect(keepsPageDate("1981", { title: "Lanterns", text: "item 119812 in the archive" }, null)).toBe(false);
  });

  it("keeps a cited date next to the snippet or next to the cited work's name", () => {
    expect(keepsCitedDate("1950", { title: "Lanterns", text }, span, null)).toBe(true);
    expect(keepsCitedDate("1872", { title: "Lanterns", text }, span, "The Old Almanac")).toBe(true);
  });

  it("keeps a cited date in the title, as on a page of the work itself", () => {
    expect(keepsCitedDate("1597", { title: "Meditationes Sacrae (1597)", text }, span, "Meditationes Sacrae")).toBe(true);
  });

  it("anchors a cited date on a short name's own words when it has no longer one", () => {
    const far = `the lantern burns brightest. ${filler(100)}`;
    const at = matchSnippet("the lantern burns brightest", far).span;
    expect(keepsCitedDate("1986", { title: "Lanterns", text: `${far} Sources: It (1986).` }, at, "It")).toBe(true);
    expect(keepsCitedDate("1986", { title: "Lanterns", text: `${far} Sources: It (1986).` }, at, "Them")).toBe(false);
  });

  it("drops a cited date that sits by neither", () => {
    expect(keepsCitedDate("1890", { title: "Lanterns", text }, span, "The Old Almanac")).toBe(false);
    expect(keepsCitedDate("1872", { title: "Lanterns", text }, span, null)).toBe(false);
    expect(keepsCitedDate("1872", { title: "Lanterns", text }, null, "1872")).toBe(false);
  });
});
