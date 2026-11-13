import type { Metadata, ResolvedMetadata } from "next";

import type { JudgeOutput } from "../agent/schemas";
import { KNOWN_LABEL } from "../components/known-answer";
import { HEADLINE } from "../components/verdict-card";
import type { EvalCase } from "../eval/cases";
import type { RunState } from "./run-state";

type SharedRun = Pick<RunState, "verdict" | "popularAttribution">;

// A verdict in a share preview's words: the verdict card's headline, except that
// no early source says whom it couldn't tie the quote to.
const answerFor = (verdict: JudgeOutput["verdict"], name: string | null): string =>
  verdict === "no_known_source" && name ? `No early source ties it to ${name}` : HEADLINE[verdict](name);

// What a finished run found, in a share preview's words. null when the run
// reached no verdict.
export function shareAnswer({ verdict, popularAttribution }: SharedRun): string | null {
  return verdict ? answerFor(verdict.output.verdict, popularAttribution) : null;
}

// Which way a verdict leaves the usual credit. Misattributed and no known source
// both say it isn't supported, so they are one side here.
const creditSide = (verdict: JudgeOutput["verdict"]): JudgeOutput["verdict"] =>
  verdict === "no_known_source" ? "misattributed" : verdict;

// Whether a run and the known answer disagree about the credit itself. Two
// verdicts that both say the credit isn't supported agree. False without a verdict.
export const disagreesOnCredit = (known: JudgeOutput["verdict"], reached: JudgeOutput["verdict"] | null): boolean =>
  reached !== null && creditSide(reached) !== creditSide(known);

// The test set's answer, in the case page's words, for a bundled case whose
// recorded run disagrees with it about the credit, so a link preview doesn't
// pass the run's verdict on as settled. null otherwise.
export function knownShareAnswer(run: SharedRun, known?: EvalCase): string | null {
  if (!known || !disagreesOnCredit(known.verdict, run.verdict?.output.verdict ?? null)) return null;
  return KNOWN_LABEL[known.verdict](known.popular_attribution);
}

// A case page's description, for search and link previews. A preview gives the
// run's answer when there is one; not every run finds an origin. When the run
// disagrees with the known answer about the credit, the known answer comes first.
export function caseShareDescription(run: SharedRun, known?: EvalCase): string {
  const answer = shareAnswer(run);
  const knownAnswer = knownShareAnswer(run, known);
  if (knownAnswer) return `The known answer: ${knownAnswer}. One recorded Said Who? run found otherwise: ${answer}.`;
  if (answer) return `What one Said Who? run found: ${answer}. Replay it, with the pages it checked.`;
  return run.popularAttribution
    ? `A finished Said Who? run looking into where this quote, usually credited to ${run.popularAttribution}, came from, with every step.`
    : "A finished Said Who? run looking into where this quote came from, with every step.";
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
