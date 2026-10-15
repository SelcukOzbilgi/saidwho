import type { Metadata, ResolvedMetadata } from "next";

import { HEADLINE } from "../components/verdict-card";
import type { RunState } from "./run-state";

// What a finished run found, in a share preview's words: the verdict card's
// headline, except that a run with no early source says whom it couldn't tie the
// quote to. null when the run reached no verdict.
export function shareAnswer({ verdict, popularAttribution }: Pick<RunState, "verdict" | "popularAttribution">): string | null {
  if (!verdict) return null;
  if (verdict.output.verdict === "no_known_source" && popularAttribution) {
    return `No early source ties it to ${popularAttribution}`;
  }
  return HEADLINE[verdict.output.verdict](popularAttribution);
}

export const quoteTitle = (quote: string): string => `“${quote}” · Said Who?`;

const RUN_DESCRIPTION = "A Said Who? run looking into where this quote came from, with every step.";

// A saved run is shared by link but kept out of search. Its preview names the
// quote and nothing else from the run; without a quote the layout's generic card
// stays. openGraph and twitter replace the layout's blocks whole, so the share
// image comes from the parent metadata to carry it over.
export function runShareMetadata(quote: string | null, parent?: Pick<ResolvedMetadata, "openGraph" | "twitter">): Metadata {
  const robots = { index: false, follow: false };
  if (!quote) return { robots };
  const title = quoteTitle(quote);
  return {
    robots,
    title,
    description: RUN_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "Said Who?",
      title,
      description: RUN_DESCRIPTION,
      images: parent?.openGraph?.images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: RUN_DESCRIPTION,
      images: parent?.twitter?.images,
    },
  };
}
