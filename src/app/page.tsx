import type { Metadata } from "next";
import { connection } from "next/server";

import { CASES, FEATURED_CASE_ID, findCase } from "../cases/cases";
import { checkerRejections } from "../cases/checker-rejections";
import { CaseGallery } from "../components/case-gallery";
import { EvalNumbers } from "../components/eval-numbers";
import { FeaturedCase } from "../components/featured-case";
import { Hero } from "../components/hero";
import { HowItWorks } from "../components/how-it-works";
import { Investigation } from "../components/investigation";
import { SiteFooter } from "../components/site-footer";
import { env } from "../lib/server/env";
import { TRIAL_RESERVE_USD } from "../lib/server/investigate-handler";
import { trialRefusal } from "../lib/server/run-keys";
import { runStoreFromEnv } from "../lib/server/run-store";

// Only this page says it is the canonical "/"; set in the layout, it would reach
// run pages and the not-found page too, since child metadata merges shallowly.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// The saved cases don't change between requests, so they are counted once.
const REJECTIONS = checkerRejections(CASES);

export default async function Home() {
  // Read the switches per request, so turning trial runs off needs no rebuild.
  await connection();
  const trialOpen =
    // The same check the API makes before a trial run.
    trialRefusal(env) === null &&
    // A trial run sets aside its worst case before it starts; a smaller budget can't fit even one.
    env.DAILY_BUDGET_USD >= TRIAL_RESERVE_USD;
  const featured = findCase(FEATURED_CASE_ID);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 pb-10 sm:gap-24 sm:px-6 sm:pb-14">
      {/* The first screen: the name, what it does, and the featured case in one move. */}
      <Hero featured={featured} />

      {/* What a run ends with comes next, so a first visit sees it before being asked for anything. */}
      {featured && <FeaturedCase example={featured} />}

      {/* Then how it got there, and how often it gets there, before the rest of the cases. */}
      <HowItWorks rejections={REJECTIONS} cases={CASES.length} />
      <EvalNumbers />

      <CaseGallery
        cases={featured ? CASES.filter((c) => c !== featured) : CASES}
        title={featured ? "More finished cases" : undefined}
      />

      <section id="run" aria-labelledby="run-title" className="scroll-mt-6">
        <Investigation
          trialOpen={trialOpen}
          // Only whether a code is needed; the code never leaves the server.
          needsCode={Boolean(env.TRIAL_ACCESS_CODE)}
          savesRuns={runStoreFromEnv(env) !== null}
          tab={
            <h2 id="run-title" className="font-serif text-2xl font-semibold sm:text-3xl">
              Run your own
            </h2>
          }
          intro="Paste any quote and watch the agents look for where it first appeared, step by step."
        />
      </section>

      <SiteFooter />
    </main>
  );
}
