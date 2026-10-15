import { describe, expect, it } from "vitest";

import { broaden, cleanQuery, isExtraRequote, isRequoteQuery, isValidQuery, queryKey, shapeQuery, shortenQuotedSpans, tidyModelText } from "./queries";

describe("cleanQuery", () => {
  it("collapses whitespace and keeps real queries in any language", () => {
    expect(cleanQuery("  origin of\n the   lantern saying ")).toBe("origin of the lantern saying");
    expect(isValidQuery('"Hayatta en hakiki mürşit ilimdir" kaynak')).toBe(true);
    expect(isValidQuery("« Qu'ils mangent de la brioche » origine")).toBe(true);
    expect(isValidQuery('"640K" memory quote')).toBe(true);
    expect(isValidQuery("640K")).toBe(true);
    expect(isValidQuery("知足")).toBe(true);
    expect(isValidQuery("мир")).toBe(true);
    expect(isValidQuery("Aşk")).toBe(true);
  });

  it("rejects a query with no letter, too few characters, or too many", () => {
    expect(cleanQuery('">"')).toBeNull();
    expect(cleanQuery(">")).toBeNull();
    expect(cleanQuery("1981")).toBeNull();
    expect(cleanQuery('"a"')).toBeNull();
    expect(cleanQuery("   ")).toBeNull();
    expect(cleanQuery("word ".repeat(70))).toBeNull();
  });
});

describe("shortenQuotedSpans", () => {
  const LONG = "The lantern burns brightest in the darkest hall of the old house at night";

  it("cuts a long quoted span to a distinctive part and leaves the rest of the query", () => {
    const shorter = shortenQuotedSpans(`"${LONG}" first appearance`);
    expect(shorter).toBe('"The lantern burns brightest in the darkest hall" first appearance');
    const words = /"([^"]+)"/.exec(shorter)?.[1].split(" ") ?? [];
    expect(words.length).toBeGreaterThanOrEqual(6);
    expect(words.length).toBeLessThanOrEqual(10);
  });

  it("never cuts a span down to a fragment with no letter in it", () => {
    const dashes = '"… … … … … … … … it is what it is"';
    expect(shortenQuotedSpans(dashes)).toBe(dashes);
    expect(broaden(dashes)).toBe("… … … … … … … … it is what it is");
  });

  it("leaves short quoted spans and unquoted text alone", () => {
    expect(shortenQuotedSpans('"burns brightest in the darkest hall" origin')).toBe('"burns brightest in the darkest hall" origin');
    expect(shortenQuotedSpans(`${LONG} origin`)).toBe(`${LONG} origin`);
  });
});

describe("broaden", () => {
  it("cuts a long quoted span first, then takes the quotes off", () => {
    const long = '"The lantern burns brightest in the darkest hall of the old house at night"';
    const fragment = broaden(long);
    expect(fragment).toBe('"The lantern burns brightest in the darkest hall"');
    expect(broaden(fragment ?? "")).toBe("The lantern burns brightest in the darkest hall");
  });

  it("has nothing to loosen in a query without quotes", () => {
    expect(broaden("lantern saying origin")).toBeNull();
  });
});

describe("queryKey", () => {
  it("treats case and punctuation as the same search, but not quotes", () => {
    expect(queryKey('"Burns brightest," origin')).toBe(queryKey('"burns brightest" Origin'));
    expect(queryKey('"burns brightest" origin')).not.toBe(queryKey("burns brightest origin"));
  });
});

// Strings the planner wrote in the evals, as they were stored.
describe("tidyModelText and shapeQuery", () => {
  it("takes markdown quote marks, stray colons and escapes off what a model wrote", () => {
    expect(tidyModelText("> 640K is enough for all users.")).toBe("640K is enough for all users.");
    expect(tidyModelText(':"Twenty years from now you will be more disappointed by the things you didn\\\'t do than by the ones you did do.')).toBe(
      '"Twenty years from now you will be more disappointed by the things you didn\'t do than by the ones you did do.',
    );
    expect(tidyModelText("Twenty years from now you will regret more the things you didn\\'t do than the things you did.")).toBe(
      "Twenty years from now you will regret more the things you didn't do than the things you did.",
    );
  });

  it("shapes a planned query from what the planner wrote", () => {
    expect(shapeQuery("> earliest newspaper article 640K enough")).toBe("earliest newspaper article 640K enough");
    expect(shapeQuery('\\"Well-behaved women seldom make history\\" Laurel Thatcher Ulrich')).toBe('"Well-behaved women seldom make history" Laurel Thatcher Ulrich');
    expect(shapeQuery("\\")).toBeNull();
    expect(shapeQuery('"Do not go where the path may lead, go instead where there is no path and leave a trail." origin')).toBe(
      '"not go where the path may lead, go" origin',
    );
  });
});

describe("isRequoteQuery", () => {
  it("matches the planner queries of the third eval that quoted the whole saying with only generic words", () => {
    const cases: [string, string][] = [
      ['earliest appearance "Be yourself; everyone else is already taken"', "Be yourself; everyone else is already taken."],
      ['origin "Be yourself; everyone else is already taken"', "Be yourself; everyone else is already taken."],
      ['"Je pense, donc je suis" première apparition', "Je pense, donc je suis"],
      ['"Je pense, donc je suis" origine citation', "Je pense, donc je suis"],
      ['first publication "Premature optimization is the root of all evil"', "Premature optimization is the root of all evil"],
      ['"Be the change you wish to see in the world" earliest appearance', "Be the change you wish to see in the world"],
      ['"Hayatta en hakiki mürşit ilimdir" ilk ne zaman söylendi', "Hayatta en hakiki mürşit ilimdir"],
      ['"Imagination is more important than knowledge" earliest newspaper', "Imagination is more important than knowledge"],
      ['"Let them eat cake" origin first appearance', "Let them eat cake"],
      ['"Well-behaved women seldom make history" earliest appearance', "Well-behaved women seldom make history"],
    ];
    for (const [query, quote] of cases) expect(isRequoteQuery(query, quote), query).toBe(true);
  });

  it("matches the exact-quote search too, which callers skip by identity", () => {
    expect(isRequoteQuery('"Let them eat cake"', "Let them eat cake")).toBe(true);
  });

  it("keeps a query with a year, a name, another word, another quoted part or a fragment of the saying", () => {
    const quote = "Let them eat cake";
    expect(isRequoteQuery('"Let them eat cake" origin 1765', quote)).toBe(false);
    expect(isRequoteQuery('"Let them eat cake" 1760s', quote)).toBe(false);
    expect(isRequoteQuery('"Let them eat cake" Rousseau Confessions', quote)).toBe(false);
    expect(isRequoteQuery('"Let them eat cake" brioche origin', quote)).toBe(false);
    expect(isRequoteQuery('"Let them eat cake" "Marie Antoinette"', quote)).toBe(false);
    expect(isRequoteQuery("Let them eat cake origin", quote)).toBe(false);
    expect(isRequoteQuery('"eat cake" origin', quote)).toBe(false);
    expect(isRequoteQuery('Henry Ford "you\'re right" quote 1947 Reader\'s Digest', "Whether you think you can, or you think you can't, you're right")).toBe(false);
  });

  it("never matches a long saying's planner queries once shapeQuery has cut the quoted part", () => {
    const quote = "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did do";
    const shaped = shapeQuery(`"${quote}" earliest appearance`);
    expect(shaped).not.toBeNull();
    expect(isRequoteQuery(shaped ?? "", quote)).toBe(false);
  });
});

describe("isExtraRequote", () => {
  it("matches a requote but not the exact-quote search, however its punctuation differs", () => {
    const quote = "Let them eat cake.";
    expect(isExtraRequote('"Let them eat cake" origin', quote)).toBe(true);
    expect(isExtraRequote('"Let them eat cake."', quote)).toBe(false);
    expect(isExtraRequote('"let them eat cake"', quote)).toBe(false);
    expect(isExtraRequote('"Let them eat cake" 1765', quote)).toBe(false);
  });
});
