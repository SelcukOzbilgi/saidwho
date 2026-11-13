import { describe, expect, it } from "vitest";

import { CASES } from "../cases/cases";
import { KNOWN } from "../cases/known";
import type { EvalCase } from "../eval/cases";
import type { RunState } from "./run-state";
import { caseShareDescription, knownShareAnswer, runShareMetadata, shareAnswer } from "./share";

const verdict = (v: string) => ({ output: { verdict: v } }) as unknown as RunState["verdict"];

describe("shareAnswer", () => {
  it("gives the verdict card's headline", () => {
    expect(shareAnswer({ verdict: verdict("misattributed"), popularAttribution: "Albert Einstein" })).toBe(
      "Albert Einstein probably didn't say it",
    );
    expect(shareAnswer({ verdict: verdict("correct"), popularAttribution: "Henry Ford" })).toBe("Henry Ford said it");
  });

  it("names whom a run with no early source couldn't tie the quote to", () => {
    expect(shareAnswer({ verdict: verdict("no_known_source"), popularAttribution: "Mustafa Kemal Atatürk" })).toBe(
      "No early source ties it to Mustafa Kemal Atatürk",
    );
    expect(shareAnswer({ verdict: verdict("no_known_source"), popularAttribution: null })).toBe(
      "No source old enough to settle it",
    );
  });

  it("is null without a verdict", () => {
    expect(shareAnswer({ verdict: null, popularAttribution: "Albert Einstein" })).toBeNull();
  });
});

const known = (v: EvalCase["verdict"]) =>
  ({ verdict: v, popular_attribution: "Mustafa Kemal Atatürk" }) as unknown as EvalCase;
const ataturkRun = { verdict: verdict("no_known_source"), popularAttribution: "Mustafa Kemal Atatürk" };

describe("knownShareAnswer", () => {
  it("gives the known answer when the run's verdict differs from it", () => {
    expect(knownShareAnswer(ataturkRun, known("correct"))).toBe("Mustafa Kemal Atatürk said it");
  });

  it("is null when the verdicts agree, there is no known answer, or the run reached no verdict", () => {
    expect(knownShareAnswer(ataturkRun, known("no_known_source"))).toBeNull();
    expect(knownShareAnswer(ataturkRun)).toBeNull();
    expect(knownShareAnswer({ ...ataturkRun, verdict: null }, known("correct"))).toBeNull();
  });
});

describe("caseShareDescription", () => {
  it("leads with the known answer and says the run reached a different verdict when they differ", () => {
    expect(caseShareDescription(ataturkRun, known("correct"))).toBe(
      "The known answer: Mustafa Kemal Atatürk said it. This recorded Said Who? run reached a different verdict: No early source ties it to Mustafa Kemal Atatürk. Replay it, with the pages it checked.",
    );
  });

  it("gives the run's answer when the verdicts agree or there is no known answer", () => {
    const runOnly = "What one Said Who? run found: No early source ties it to Mustafa Kemal Atatürk. Replay it, with the pages it checked.";
    expect(caseShareDescription(ataturkRun, known("no_known_source"))).toBe(runOnly);
    expect(caseShareDescription(ataturkRun)).toBe(runOnly);
  });

  it("describes a run with no verdict as before, known answer or not", () => {
    const noVerdict = { verdict: null, popularAttribution: "Mustafa Kemal Atatürk" };
    const before =
      "A finished Said Who? run looking into where this quote, usually credited to Mustafa Kemal Atatürk, came from, with every step.";
    expect(caseShareDescription(noVerdict, known("correct"))).toBe(before);
    expect(caseShareDescription({ verdict: null, popularAttribution: null })).toBe(
      "A finished Said Who? run looking into where this quote came from, with every step.",
    );
  });

  it("changes only the bundled cases whose run disagrees with the known answer", () => {
    const descriptions = Object.fromEntries(CASES.map((c) => [c.caseId, caseShareDescription(c.run, KNOWN.get(c.caseId))]));
    const differing = {
      "en-hakiki-mursit":
        "The known answer: Mustafa Kemal Atatürk said it. This recorded Said Who? run reached a different verdict: No early source ties it to Mustafa Kemal Atatürk. Replay it, with the pages it checked.",
      "faster-horses":
        "The known answer: No early source ties it to Henry Ford. This recorded Said Who? run reached a different verdict: Henry Ford probably didn't say it. Replay it, with the pages it checked.",
    };
    for (const c of CASES) {
      expect(descriptions[c.caseId]).toBe(
        differing[c.caseId as keyof typeof differing] ??
          `What one Said Who? run found: ${shareAnswer(c.run)}. Replay it, with the pages it checked.`,
      );
    }
    expect(CASES).toHaveLength(10);
  });
});

describe("runShareMetadata", () => {
  const parent = { openGraph: { images: [{ url: "/opengraph-image.jpg" }] }, twitter: { images: [{ url: "/twitter-image.jpg" }] } };

  it("titles the share preview with the quote and keeps the run out of search", () => {
    const meta = runShareMetadata("Let them eat cake.", parent as never);
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.title).toBe("“Let them eat cake.” · Said Who?");
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.twitter?.title).toBe(meta.title);
    expect(meta.openGraph?.images).toEqual(parent.openGraph.images);
    expect(meta.twitter?.images).toEqual(parent.twitter.images);
  });

  it("describes the run in the same generic words for every run", () => {
    const meta = runShareMetadata("Let them eat cake.", parent as never);
    expect(meta.description).toBe(runShareMetadata("Be the change.", parent as never).description);
    expect(meta.openGraph?.description).toBe(meta.description);
    expect(meta.twitter?.description).toBe(meta.description);
  });

  it("keeps the generic card when the run can't be loaded", () => {
    expect(runShareMetadata(null, parent as never)).toEqual({ robots: { index: false, follow: false } });
  });
});
