import type { Metadata, ResolvingMetadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CASES, findCase } from "@/cases/cases";
import { KNOWN } from "@/cases/known";
import { CaseReplay } from "@/components/case-replay";
import { KnownAnswer } from "@/components/known-answer";
import { SiteFooter } from "@/components/site-footer";
import { HEADLINE } from "@/components/verdict-card";
import { plural } from "@/lib/plural";

// Every case page is built ahead of time, so the test set is read at build time only.
export const dynamicParams = false;

export function generateStaticParams() {
  return CASES.map(({ caseId }) => ({ id: caseId }));
}

export async function generateMetadata({ params }: PageProps<"/cases/[id]">, parent: ResolvingMetadata): Promise<Metadata> {
  const found = findCase((await params).id);
  if (!found) return {};
  const { quote, popularAttribution, verdict } = found.run;
  const title = `“${quote}” · Said Who?`;
  // A share preview gives the run's answer when there is one; not every run finds an origin.
  const answer =
    verdict?.output.verdict === "no_known_source" && popularAttribution
      ? `No early source ties it to ${popularAttribution}`
      : verdict && HEADLINE[verdict.output.verdict](popularAttribution);
  const description = answer
    ? `What one Said Who? run found: ${answer}. Replay it, with the pages it checked.`
    : popularAttribution
      ? `A finished Said Who? run looking into where this quote, usually credited to ${popularAttribution}, came from, with every step.`
      : "A finished Said Who? run looking into where this quote came from, with every step.";
  const url = `/cases/${found.caseId}`;
  const shared = await parent;
  return {
    title,
    description,
    alternates: { canonical: url },
    // These replace the layout's whole openGraph and twitter blocks, so they carry
    // its share image over too.
    openGraph: { type: "article", siteName: "Said Who?", title, description, url, images: shared.openGraph?.images },
    twitter: { card: "summary_large_image", title, description, images: shared.twitter?.images },
  };
}

export default async function CasePage({ params }: PageProps<"/cases/[id]">) {
  const found = findCase((await params).id);
  if (!found) notFound();
  const known = KNOWN.get(found.caseId);
  const started = found.events.find((e) => e.type === "started");
  const ranOn = new Date(found.ranAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <nav className="text-sm">
        <Link href="/" className="text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Said Who<span className="text-accent">?</span>
        </Link>
      </nav>

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
