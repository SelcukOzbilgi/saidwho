import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CASES, FEATURED_CASE_ID, findCase } from "../cases/cases";
import { FeaturedCase, plainNote, trailOf } from "./featured-case";

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
    expect(html).toContain('href="#run"');
    expect(html).not.toContain('href="#node-');
    expect(html).not.toMatch(/\[n\d+\]/);
  });

  it("gives the earliest trace the judge named", () => {
    const html = renderToStaticMarkup(createElement(FeaturedCase, { example: featured! }));
    expect(html).toContain("Earliest trace: <strong>Rita Mae Brown, 1983</strong>");
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
});
