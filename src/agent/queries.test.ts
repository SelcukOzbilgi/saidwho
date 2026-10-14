import { describe, expect, it } from "vitest";

import { broaden, cleanQuery, isValidQuery, queryKey, shapeQuery, shortenQuotedSpans, tidyModelText } from "./queries";

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
