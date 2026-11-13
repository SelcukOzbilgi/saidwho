import type { ResolvingMetadata } from "next";
import { describe, expect, it } from "vitest";

import { generateMetadata } from "./page";

const parentWith = (meta: object) => Promise.resolve(meta) as ResolvingMetadata;
// The page doesn't read its props; a bare object stands in for them.
const props = {} as Parameters<typeof generateMetadata>[0];

describe("run page metadata", () => {
  it("carries the share images from the parent over to openGraph and twitter", async () => {
    const parent = {
      openGraph: { images: [{ url: "/opengraph-image.jpg" }] },
      twitter: { images: [{ url: "/twitter-image.jpg" }] },
    };
    const meta = await generateMetadata(props, parentWith(parent));
    expect(meta.openGraph?.images).toEqual(parent.openGraph.images);
    expect(meta.twitter?.images).toEqual(parent.twitter.images);
  });

  it("keeps the page's own title, description and canonical", async () => {
    const meta = await generateMetadata(props, parentWith({}));
    expect(meta.title).toBe("Run your own · Said Who?");
    expect(meta.description).toBe("Paste any quote and watch the agents look for where it first appeared, step by step.");
    expect(meta.alternates?.canonical).toBe("/run");
    expect(meta.openGraph).toMatchObject({ type: "website", siteName: "Said Who?", url: "/run", title: meta.title });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: meta.title });
  });

  it("has no images when the parent has none", async () => {
    const meta = await generateMetadata(props, parentWith({}));
    expect(meta.openGraph?.images).toBeUndefined();
    expect(meta.twitter?.images).toBeUndefined();
  });
});
