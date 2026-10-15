import { describe, expect, it } from "vitest";

import type { RunState } from "./run-state";
import { runShareMetadata, shareAnswer } from "./share";

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
