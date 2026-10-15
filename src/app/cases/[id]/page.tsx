import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CASES, findCase } from "@/cases/cases";
import { KNOWN } from "@/cases/known";
import { CaseReplay } from "@/components/case-replay";
import { KnownAnswer } from "@/components/known-answer";
import { SiteFooter } from "@/components/site-footer";
import { plural } from "@/lib/plural";
import { quoteTitle, shareAnswer } from "@/lib/share";

// Every case page is built ahead of time, so the test set is read at build time only.
export const dynamicParams = false;

export function generateStaticParams() {
  return CASES.map(({ caseId }) => ({ id: caseId }));
}

export async function generateMetadata({ params }: PageProps<"/cases/[id]">): Promise<Metadata> {
  const found = findCase((await params).id);
  const { quote, popularAttribution } = found?.run ?? {};
  if (!found || !quote) return {};
  const title = quoteTitle(quote);
  // A share preview gives the run's answer when there is one; not every run finds an origin.
  const answer = shareAnswer(found.run);
  const description = answer
    ? `What one Said Who? run found: ${answer}. Replay it, with the pages it checked.`
    : popularAttribution
      ? `A finished Said Who? run looking into where this quote, usually credited to ${popularAttribution}, came from, with every step.`
      : "A finished Said Who? run looking into where this quote came from, with every step.";
  const url = `/cases/${found.caseId}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // The share image is the case's own card, from opengraph-image and twitter-image here.
    openGraph: { type: "article", siteName: "Said Who?", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const found = findCase((await params).id);
  if (!found) notFound();
  const known = KNOWN.get(found.caseId);
  const started = found.events.find((e) => e.type === "started");
  const ranOn = new Date(found.ranAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-4 pb-10 sm:px-6 sm:pt-6 sm:pb-14">
      {/* The run log's first line names the sites that were left out. */}
      <p className="text-sm text-muted">
        A recorded run from {ranOn}
        {started && started.excludeDomains.length > 0
          ? `, with ${plural(started.excludeDomains.length, "site")} that already ${started.excludeDomains.length === 1 ? "answers" : "answer"} it kept out of the search.`
          : "."}
      </p>

      <CaseReplay
        events={found.events}
        afterVerdict={known && <KnownAnswer known={known} reached={found.run.verdict?.output.verdict ?? null} />}
      />

      <SiteFooter />
    </main>
  );
}
