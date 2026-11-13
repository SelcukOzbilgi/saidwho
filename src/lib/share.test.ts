import { describe, expect, it } from "vitest";

import { CASES } from "../cases/cases";
import { KNOWN } from "../cases/known";
import type { EvalCase } from "../eval/cases";
import type { RunState } from "./run-state";
import { caseShareDescription, disagreesOnCredit, knownShareAnswer, runShareMetadata, shareAnswer } from "./share";

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

describe("disagreesOnCredit", () => {
  it("counts misattributed and no known source as the same side, and correct and contested as their own", () => {
    const verdicts = ["misattributed", "no_known_source", "correct", "contested"] as const;
    const side = { misattributed: "against", no_known_source: "against", correct: "correct", contested: "contested" };
    for (const known of verdicts) {
      for (const reached of verdicts) {
        expect(disagreesOnCredit(known, reached), `${known} vs ${reached}`).toBe(side[known] !== side[reached]);
      }
    }
    expect(disagreesOnCredit("misattributed", "no_known_source")).toBe(false);
    expect(disagreesOnCredit("correct", "contested")).toBe(true);
  });

  it("is false when the run reached no verdict", () => {
    expect(disagreesOnCredit("correct", null)).toBe(false);
  });
});

describe("knownShareAnswer", () => {
  it("gives the known answer in the case page's words when the run disagrees about the credit", () => {
    expect(knownShareAnswer(ataturkRun, known("correct"))).toBe("Correctly credited to Mustafa Kemal Atatürk");
  });

  it("is null when the run agrees about the credit, there is no known answer, or the run reached no verdict", () => {
    expect(knownShareAnswer(ataturkRun, known("no_known_source"))).toBeNull();
    expect(knownShareAnswer(ataturkRun, known("misattributed"))).toBeNull();
    expect(knownShareAnswer(ataturkRun)).toBeNull();
    expect(knownShareAnswer({ ...ataturkRun, verdict: null }, known("correct"))).toBeNull();
  });

  it("takes over only the Atatürk case's share card among the bundled cases", () => {
    const takenOver = CASES.filter((c) => knownShareAnswer(c.run, KNOWN.get(c.caseId)) !== null).map((c) => c.caseId);
    expect(takenOver).toEqual(["en-hakiki-mursit"]);
  });
});

describe("caseShareDescription", () => {
  it("leads with the known answer and says what the run found when they disagree about the credit", () => {
    const description = caseShareDescription(ataturkRun, known("correct"));
    expect(description).toBe(
      "The known answer: Correctly credited to Mustafa Kemal Atatürk. One recorded Said Who? run found otherwise: No early source ties it to Mustafa Kemal Atatürk.",
    );
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it("gives the run's answer when the run agrees about the credit or there is no known answer", () => {
    const runOnly = "What one Said Who? run found: No early source ties it to Mustafa Kemal Atatürk. Replay it, with the pages it checked.";
    expect(caseShareDescription(ataturkRun, known("no_known_source"))).toBe(runOnly);
    expect(caseShareDescription(ataturkRun, known("misattributed"))).toBe(runOnly);
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

  it("changes only the bundled case whose run disagrees with the known answer about the credit", () => {
    const descriptions = Object.fromEntries(CASES.map((c) => [c.caseId, caseShareDescription(c.run, KNOWN.get(c.caseId))]));
    expect(descriptions["en-hakiki-mursit"]).toBe(
      "The known answer: Correctly credited to Mustafa Kemal Atatürk. One recorded Said Who? run found otherwise: No early source ties it to Mustafa Kemal Atatürk.",
    );
    // The other nine keep the description they had before known answers were taken into account.
    const before: Record<string, string> = {
      "insanity-same-thing": "Albert Einstein probably didn't say it",
      "gel-ne-olursan-ol": "Whether Mevlana (Rumi) said it is contested",
      "so-much-owed": "Winston Churchill said it",
      "be-the-change": "Mahatma Gandhi probably didn't say it",
      "good-men-do-nothing": "Edmund Burke probably didn't say it",
      "let-them-eat-cake": "Marie Antoinette probably didn't say it",
      "faster-horses": "Henry Ford probably didn't say it",
      "think-you-can": "Henry Ford said it",
      "fear-itself": "Franklin D. Roosevelt said it",
    };
    for (const [id, answer] of Object.entries(before)) {
      expect(descriptions[id]).toBe(`What one Said Who? run found: ${answer}. Replay it, with the pages it checked.`);
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
