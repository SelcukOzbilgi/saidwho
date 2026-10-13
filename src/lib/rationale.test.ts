import { describe, expect, it } from "vitest";

import { capForDisplay, MAX_DISPLAY_CHARS, parseRationale, readable, splitCitations } from "./rationale";

// Shows a split as text, with each group of ids as <ids>.
const show = (text: string) => splitCitations(text).map((p) => (typeof p === "string" ? p : `<${p.ids.join(" ")}>`)).join("");

describe("splitCitations", () => {
  it("finds a bare id, a bracketed one and a list in parentheses", () => {
    expect(show("See n2.")).toBe("See <n2>.");
    expect(show("See [n2].")).toBe("See <n2>.");
    expect(show("none of them (n1, n2, n3).")).toBe("none of them <n1 n2 n3>.");
  });

  it("splits ids that came glued together, and gives them a space from the word before", () => {
    expect(show("misattributed to him.[n1][n2][n3][n5]")).toBe("misattributed to him. <n1 n2 n3 n5>");
    expect(show("misattributed to him.n1n2n3n5n7n10n11")).toBe("misattributed to him. <n1 n2 n3 n5 n7 n10 n11>");
    expect(show("credited to Gandhi【n10】. Later")).toBe("credited to Gandhi <n10>. Later");
    expect(show("passage【n6】【n7】【n12】, but")).toBe("passage <n6 n7 n12>, but");
  });

  it("drops brackets that hold nothing but ids, and keeps a list's words", () => {
    expect(show("Confessions ([n3], [n12], [n15]). No")).toBe("Confessions <n3 n12 n15>. No");
    expect(show("attributed to Burke (see n1,n2,n3)")).toBe("attributed to Burke (see <n1 n2 n3>)");
  });

  it("shows an id once in a group, and leaves words alone", () => {
    expect(show("nodes n2 ([n2]), n1 ([n1])")).toBe("nodes <n2 n1>");
    expect(show("In 2014 (YouTube) and n95 masks")).toBe("In 2014 (YouTube) and <n95> masks");
    expect(show("an1 and n2x stay words")).toBe("an1 and n2x stay words");
  });

  it("leaves quoted words and links as written", () => {
    expect(show("The quote is “n3n3”.")).toBe("The quote is “n3n3”.");
    expect(show('The page says "see n3" [n4].')).toBe('The page says "see n3" <n4>.');
    expect(show("Kept at https://example.org/n3 [n3].")).toBe("Kept at https://example.org/n3 <n3>.");
    expect(show("A 'n1n2' code and «n7»")).toBe("A 'n1n2' code and «n7»");
  });

  it("stays quick on long runs of space", () => {
    const start = performance.now();
    const parts = splitCitations(`([n1]${" ".repeat(50_000)}x`);
    expect(performance.now() - start).toBeLessThan(200);
    expect(parts.some((p) => typeof p !== "string" && p.ids[0] === "n1")).toBe(true);
  });
});

describe("parseRationale", () => {
  const show = (text: string) =>
    parseRationale(text)
      .map((p) => {
        const body = "ids" in p ? `<${p.ids.join(" ")}>` : p.text;
        return p.style ? `{${p.style}:${body}}` : body;
      })
      .join("");

  it("groups ids across emphasis and keeps the emphasis", () => {
    expect(show("See **[n3]**[n3].")).toBe("See {strong:<n3>}.");
    expect(show("See **[n3]**[n4] in *Sudden Death*.")).toBe("See {strong:<n3 n4>} in {em:Sudden Death}.");
  });

  it("doesn't read a link's underscores as emphasis", () => {
    expect(show("At https://example.org/Be_the_Change_now [n2].")).toBe("At https://example.org/Be_the_Change_now <n2>.");
  });

  it("cuts a long saved text before reading it, quickly", () => {
    const start = performance.now();
    const parts = parseRationale(`“${"(n1 ".repeat(30_000)}${"“".repeat(30_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
    const shown = parts.map((p) => ("ids" in p ? p.ids.join(" ") : p.text)).join("");
    expect(shown.length).toBeLessThan(MAX_DISPLAY_CHARS + 10);
  });
});

describe("capForDisplay", () => {
  it("keeps short text and cuts long text with an ellipsis", () => {
    expect(capForDisplay("short")).toBe("short");
    const cut = capForDisplay("a".repeat(MAX_DISPLAY_CHARS + 5));
    expect(cut).toHaveLength(MAX_DISPLAY_CHARS + 1);
    expect(cut.endsWith("…")).toBe(true);
  });
});

describe("readable", () => {
  it("puts the models' field names in words", () => {
    expect(readable("n4 which carries a page_date of 1933")).toBe("n4 which carries a page date of 1933");
    expect(readable("cited by n6 (cited_source_date: 1999)")).toBe("cited by n6 (cited source's date: 1999)");
    expect(readable("thus earliest_date and earliest_author are null.")).toBe("thus earliest date and earliest author are not given.");
  });

  it("calls the evidence pages, as the rest of the page does", () => {
    expect(readable("Node n3 presents it. No node cites an earlier source; later nodes agree.")).toBe(
      "Page n3 presents it. No page cites an earlier source; later pages agree.",
    );
  });

  it("leaves other underscored words, links, quotes and titles as written", () => {
    expect(readable("Jean_Paul wrote it")).toBe("Jean_Paul wrote it");
    expect(readable("See https://example.org/Be_the_Change and https://x.org/page_date")).toBe(
      "See https://example.org/Be_the_Change and https://x.org/page_date",
    );
    expect(readable("The page reads “Each node is null.” and page_date is null.")).toBe(
      "The page reads “Each node is null.” and page date is not given.",
    );
    expect(readable("Quoted 'node' and \"page_date\" and «null» stay")).toBe("Quoted 'node' and \"page_date\" and «null» stay");
    expect(readable("In _Sudden Death_ (1983), a nodal point")).toBe("In _Sudden Death_ (1983), a nodal point");
  });
});
