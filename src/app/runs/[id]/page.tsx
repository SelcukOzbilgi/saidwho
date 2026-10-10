import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { runEventSchema } from "@/agent/events";
import { CaseReplay } from "@/components/case-replay";
import { SiteFooter } from "@/components/site-footer";
import { env } from "@/lib/server/env";
import { runStoreFromEnv } from "@/lib/server/run-store";

// A saved run, opened from its public link. Unlike the example cases there is no
// known answer to show next to it.

const eventsSchema = z.array(runEventSchema);

// Metadata and the page both need the run; this loads it once per request.
const loadRun = cache(async (id: string) => {
  await connection();
  const saved = await runStoreFromEnv(env)?.load(id);
  if (!saved) return null;
  const events = eventsSchema.safeParse(saved.events);
  return events.success ? { createdAt: saved.createdAt, events: events.data } : null;
});

export async function generateMetadata({ params }: PageProps<"/runs/[id]">): Promise<Metadata> {
  const run = await loadRun((await params).id);
  const started = run?.events.find((e) => e.type === "started");
  return {
    // Shared by link, not listed: search engines are asked to leave it out.
    robots: { index: false, follow: false },
    ...(started && {
      title: `“${started.quote}” · Said Who?`,
      description: "A Said Who? run looking into where this quote came from, with every step.",
    }),
  };
}

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const run = await loadRun((await params).id);
  if (!run) notFound();
  const started = run.events.find((e) => e.type === "started");
  const ranOn = new Date(run.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <nav className="text-sm">
        <Link href="/" className="text-muted underline-offset-4 hover:text-foreground hover:underline">
          ← Said Who<span className="text-accent">?</span>
        </Link>
      </nav>

      <p className="text-sm text-muted">
        A saved run, made on {ranOn}.
        {started && ` Left out of the search, so the trail had to be found elsewhere: ${started.excludeDomains.join(", ")}.`}
      </p>

      <CaseReplay events={run.events} />

      <SiteFooter />
    </main>
  );
}
