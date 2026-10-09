import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CASES, findCase } from "@/cases/cases";
import { CaseReplay } from "@/components/case-replay";
import { KnownAnswer } from "@/components/known-answer";
import { SiteFooter } from "@/components/site-footer";
import { parseEvalCases } from "@/eval/cases";

// Every case page is built ahead of time, so the test set is read at build time only.
export const dynamicParams = false;

const KNOWN = new Map(
  parseEvalCases(readFileSync(path.join(process.cwd(), "eval", "quotes.jsonl"), "utf8")).map((c) => [c.id, c]),
);

export function generateStaticParams() {
  return CASES.map(({ caseId }) => ({ id: caseId }));
}

export async function generateMetadata({ params }: PageProps<"/cases/[id]">): Promise<Metadata> {
  const found = findCase((await params).id);
  if (!found) return {};
  return {
    title: `“${found.run.quote}” · Said Who?`,
    description: `Where this quote, usually credited to ${found.run.popularAttribution}, first appeared: a finished Said Who? run with every step.`,
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

      <p className="text-sm text-muted">
        A finished case, run on {ranOn}.
        {started && ` Left out of the search, so the trail had to be found elsewhere: ${started.excludeDomains.join(", ")}.`}
      </p>

      <CaseReplay
        events={found.events}
        afterVerdict={known && <KnownAnswer known={known} reached={found.run.verdict?.output.verdict ?? null} />}
      />

      <SiteFooter />
    </main>
  );
}
