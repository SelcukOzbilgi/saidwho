import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CASES, FEATURED_CASE_ID, findCase } from "../cases/cases";
import { FeaturedCase, plainNote, playLeads, trailOf } from "./featured-case";

const featured = findCase(FEATURED_CASE_ID);

describe("plainNote", () => {
  it("drops evidence ids and Markdown marks, which have nothing to point to here", () => {
    expect(plainNote("Thus the saying is misattributed to him.[n1][n2][n3]")).toBe(
      "Thus the saying is misattributed to him.",
    );
    expect(plainNote("Seen in a 1983 novel (n3, n5) and later n7 online.")).toBe("Seen in a 1983 novel and later online.");
    expect(plainNote("Credited in *Sudden Death* by **Rita Mae Brown**.")).toBe("Credited in Sudden Death by Rita Mae Brown.");
    expect(plainNote("Version n10 shows up in 1981.")).toBe("Version shows up in 1981.");
    expect(plainNote("As cited by pages n1, n2, and n7. Later n3 and n5 credit Einstein.")).toBe(
      "As cited by pages. Later credit Einstein.",
    );
  });

  it("drops ids in full-width brackets and keeps one at the end of a URL", () => {
    expect(plainNote("Seen in a 1983 novel【n3】 and later （n5, n7） online.")).toBe("Seen in a 1983 novel and later online.");
    expect(plainNote("The scan is at https://example.org/scans/n3 and n4 agrees.")).toBe(
      "The scan is at https://example.org/scans/n3 and agrees.",
    );
  });
});

describe("trailOf", () => {
  it("starts where the quote was first seen and keeps only confirmed pages", () => {
    const run = featured!.run;
    const { steps, more } = trailOf(run);
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.length).toBeLessThanOrEqual(3);
    expect(steps[0].change).toBe("first");
    for (const { node } of steps) expect(node.check.status).not.toBe("not_found");
    expect(steps.length + more).toBeLessThanOrEqual(run.verdict!.output.lineage!.length);
  });

  it("shows no trail when the first step's page wasn't confirmed", () => {
    const run = featured!.run;
    const first = run.verdict!.output.lineage![0].node;
    const unconfirmed = {
      ...run,
      nodes: run.nodes.map((n) => (n.id === first ? { ...n, check: { ...n.check, status: "not_found" as const } } : n)),
    };
    expect(trailOf(unconfirmed)).toEqual({ steps: [], more: 0 });
  });
});

describe("playLeads", () => {
  it("plays the trail before the verdict side by side, and the verdict first on a phone, the cost row last in both", () => {
    for (const steps of [2, 3]) {
      const { wide, narrow } = playLeads(steps);
      expect(wide.trail).toBeLessThan(wide.verdict);
      expect(wide.verdict).toBeLessThan(wide.footer);
      expect(narrow.verdict).toBeLessThan(narrow.trail);
      expect(narrow.trail).toBeLessThan(narrow.footer);
    }
    expect(playLeads(3).wide.verdict).toBeGreaterThan(playLeads(2).wide.verdict);
  });

  it("starts the verdict at once when there is no trail to wait for", () => {
    const { wide, narrow } = playLeads(0);
    expect(wide.verdict).toBe(0);
    expect(narrow.verdict).toBe(0);
    expect(wide.footer).toBe(narrow.footer);
  });
});

describe("FeaturedCase", () => {
  it("is a finished case with a verdict and a trail", () => {
    expect(featured).toBeDefined();
    expect(featured!.run.verdict).not.toBeNull();
    expect(trailOf(featured!.run).steps.length).toBeGreaterThanOrEqual(2);
  });

  it("shows the verdict and links each step to its card on the case page, never to this page", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! }));
    expect(html).toContain("Albert Einstein probably didn&#x27;t say it");
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}"`);
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}#node-${trailOf(featured!.run).steps[0].node.id}"`);
    expect(html).toContain('href="/run"');
    expect(html).not.toContain('href="#node-');
    expect(html).not.toMatch(/\[n\d+\]/);
  });

  it("says where the earliest trace was seen when the judge named no author", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! }));
    expect(html).toContain("Earliest trace: <strong>1980, Narcotics Anonymous literature</strong>, via style.mla.org");
  });

  it("leaves the quote, the credit and the earliest trace to the hero when it shows them", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured!, afterHero: true }));
    expect(html).not.toContain("<blockquote");
    expect(html).not.toContain("Usually credited to");
    expect(html).not.toContain("Earliest trace:");
    expect(html).toContain("Albert Einstein probably didn&#x27;t say it");
    expect(html).toContain(`href="/cases/${FEATURED_CASE_ID}#node-${trailOf(featured!.run).steps[0].node.id}"`);
  });

  it("gives the judge's reasoning on every screen size, cut short only on a phone", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! }));
    const reasoning = plainNote(featured!.run.verdict!.output.rationale);
    const tag = new RegExp(`<p class="([^"]*)">${reasoning.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(html);
    expect(tag).not.toBeNull();
    expect(tag![1]).not.toMatch(/\bhidden\b/);
    expect(tag![1]).toContain("line-clamp-3");
    expect(tag![1]).toContain("sm:line-clamp-none");
  });

  it("leaves the time out when the run didn't record one", () => {
    const timed = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! }));
    expect(timed).toContain(` · ${featured!.run.seconds}s`);
    const example = { ...featured!, run: { ...featured!.run, seconds: null } };
    const untimed = renderToStaticMarkup(createElement(FeaturedCase, { example }));
    expect(untimed).not.toContain("null");
    expect(untimed).toContain(`$${featured!.run.nebiusUsd.toFixed(4)}`);
  });

  it("says how much cheaper the run was than the same calls at Ultra prices, from the run's own figures", () => {
    const text = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! })).replace(/<[^>]+>/g, "");
    const ratio = Math.round(featured!.run.ultraUsd! / featured!.run.nebiusUsd);
    expect(text).toContain(`${ratio}x cheaper than the same calls at Nemotron 3 Ultra prices`);
    const example = { ...featured!, run: { ...featured!.run, ultraUsd: null } };
    expect(renderToStaticMarkup(createElement(FeaturedCase, { example }))).not.toContain("cheaper");
  });

  it("renders nothing for a case without a verdict", () => {
    const noVerdict = CASES.find((c) => !c.run.verdict);
    const example = noVerdict ?? { ...featured!, run: { ...featured!.run, verdict: null } };
    expect(renderToStaticMarkup(createElement(FeaturedCase, { example }))).toBe("");
  });

  it("draws one stretch of line between each pair of steps", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured!, afterHero: true }));
    const steps = trailOf(featured!.run).steps.length;
    expect(html.match(/fc-segment/g)).toHaveLength(steps - 1);
    expect(html.match(/fc-marker/g)).toHaveLength(steps);
  });

  it("is rendered finished, so it reads the same without JavaScript or motion", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured!, afterHero: true }));
    expect(html).not.toContain("data-reveal");
    expect(html).not.toMatch(/opacity:\s*0/);
  });
});
