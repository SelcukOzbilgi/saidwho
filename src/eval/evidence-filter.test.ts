import { describe, expect, it } from "vitest";

import { applyFilter, filterLabel, NO_FILTER, onHosts, parseEvidenceFilter } from "./evidence-filter";

const QUOTE = "Let them eat cake";
const SEARCHES = [
  { query: `"${QUOTE}"`, urls: ["https://a.org/1", "https://www.facebook.com/post/9"] },
  { query: `"${QUOTE}" origin first appearance`, urls: ["https://a.org/1", "https://b.org/2"] },
  { query: 'Rousseau Confessions "eat cake" brioche', urls: ["https://c.org/3"] },
];
const NODES = [
  { id: "n1", url: "https://a.org/1", foundVia: null },
  { id: "n2", url: "https://www.facebook.com/post/9" },
  { id: "n3", url: "https://b.org/2" },
  { id: "n4", url: "https://c.org/3" },
  { id: "n5", url: "https://archive.org/details/x", foundVia: { node: "n3", work: "Confessions" } },
  { id: "n6", url: "https://gallica.bnf.fr/y", foundVia: { node: "n5", work: "Mémoires" } },
  { id: "n7", url: "https://archive.org/details/z", foundVia: { node: "n4", work: "Émile" } },
];

describe("parseEvidenceFilter", () => {
  it("takes requote and a host list, and nothing else", () => {
    expect(parseEvidenceFilter(null, null)).toEqual(NO_FILTER);
    expect(parseEvidenceFilter("requote", " www.Facebook.com, reddit.com,reddit.com ")).toEqual({ requote: true, hosts: ["facebook.com", "reddit.com"] });
    expect(() => parseEvidenceFilter("planner", null)).toThrow(/requote/);
    expect(() => parseEvidenceFilter(null, "https://x.com/")).toThrow(/host names/);
    expect(() => parseEvidenceFilter(null, ",")).toThrow(/at least one/);
  });

  it("labels a filter for the output", () => {
    expect(filterLabel(NO_FILTER)).toBe("none");
    expect(filterLabel({ requote: true, hosts: ["x.com"] })).toBe("requote + hosts x.com");
  });
});

describe("onHosts", () => {
  it("matches a host and its subdomains, not a host that only ends the same way", () => {
    expect(onHosts("https://www.reddit.com/r/q", ["reddit.com"])).toBe(true);
    expect(onHosts("https://old.reddit.com/r/q", ["reddit.com"])).toBe(true);
    expect(onHosts("https://notreddit.com/r/q", ["reddit.com"])).toBe(false);
    expect(onHosts("https://x.com/u/1", ["x.com"])).toBe(true);
    expect(onHosts("https://dropbox.com/u/1", ["x.com"])).toBe(false);
    expect(onHosts("not a url", ["x.com"])).toBe(false);
  });
});

describe("applyFilter", () => {
  it("drops nothing without a filter", () => {
    const dropped = applyFilter(QUOTE, SEARCHES, NODES, NO_FILTER);
    expect(dropped.searches.size).toBe(0);
    expect(dropped.nodes.size).toBe(0);
  });

  it("drops the re-quoting search's own pages, keeps one another search returned, and never drops the exact-quote search", () => {
    const dropped = applyFilter(QUOTE, SEARCHES, NODES, { requote: true, hosts: [] });
    expect([...dropped.searches]).toEqual([1]);
    // n1 came back from the exact-quote search too; n3 only from the dropped one,
    // and the lead from n3 goes with it, and the lead from that lead's page.
    expect(Object.fromEntries(dropped.nodes)).toEqual({ n3: "search", n5: "lead", n6: "lead" });
  });

  it("drops pages on the hosts, subdomains included, with what was found from them", () => {
    const nodes = [...NODES, { id: "n8", url: "https://m.facebook.com/p/1", foundVia: { node: "n4", work: "Émile" } }];
    const dropped = applyFilter(QUOTE, SEARCHES, nodes, { requote: false, hosts: ["facebook.com"] });
    expect(dropped.searches.size).toBe(0);
    expect(Object.fromEntries(dropped.nodes)).toEqual({ n2: "host", n8: "host" });
  });

  it("applies both at once", () => {
    const dropped = applyFilter(QUOTE, SEARCHES, NODES, { requote: true, hosts: ["facebook.com"] });
    expect(Object.fromEntries(dropped.nodes)).toEqual({ n2: "host", n3: "search", n5: "lead", n6: "lead" });
  });

  it("keeps a lead's page that a kept search returned when the first round would now read it", () => {
    // n3 came only from the re-quoting search; a lead from it found late.org,
    // which the third search returned past the first round's MAX_PAGES.
    const urls = (site: string, n: number) => Array.from({ length: n }, (_, i) => `https://${site}/${i}`);
    const searches = (exact: number) => [
      { query: `"${QUOTE}"`, urls: urls("a.org", exact) },
      { query: `"${QUOTE}" origin first appearance`, urls: urls("b.org", 10) },
      { query: 'Rousseau Confessions "eat cake" brioche', urls: ["https://late.org/x"] },
    ];
    const nodes = [
      { id: "n3", url: "https://b.org/0" },
      { id: "n30", url: "https://late.org/x", foundVia: { node: "n3", work: "Confessions" } },
    ];
    // Without the re-quoting search's 10 pages it comes 16th, and is read.
    expect(Object.fromEntries(applyFilter(QUOTE, searches(15), nodes, { requote: true, hosts: [] }).nodes)).toEqual({ n3: "search" });
    // Behind 20 kept pages it is still past the limit, so it goes with its lead.
    expect(Object.fromEntries(applyFilter(QUOTE, searches(20), nodes, { requote: true, hosts: [] }).nodes)).toEqual({ n3: "search", n30: "lead" });
  });

  it("leaves a page no logged search returned with text to the caller, as missing rather than dropped", () => {
    const dropped = applyFilter(QUOTE, SEARCHES, [{ id: "n9", url: "https://gone.org/9" }], { requote: true, hosts: [] });
    expect(dropped.nodes.size).toBe(0);
  });
});
