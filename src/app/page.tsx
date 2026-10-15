import { connection } from "next/server";

import { CASES, FEATURED_CASE_ID, findCase } from "../cases/cases";
import { checkerRejections } from "../cases/checker-rejections";
import { CaseGallery } from "../components/case-gallery";
import { EvalNumbers } from "../components/eval-numbers";
import { FeaturedCase } from "../components/featured-case";
import { HowItWorks } from "../components/how-it-works";
import { Investigation } from "../components/investigation";
import { SiteFooter } from "../components/site-footer";
import { env } from "../lib/server/env";
import { TRIAL_RESERVE_USD } from "../lib/server/investigate-handler";
import { runStoreFromEnv } from "../lib/server/run-store";

// The saved cases don't change between requests, so they are counted once.
const REJECTIONS = checkerRejections(CASES);

export default async function Home() {
  // Read the switches per request, so turning trial runs off needs no rebuild.
  await connection();
  const trialOpen =
    env.LIVE_RUNS_ENABLED &&
    env.TRIAL_RUNS_ENABLED &&
    Boolean(env.NEBIUS_API_KEY && env.TAVILY_API_KEY) &&
    // A trial run sets aside its worst case before it starts; a smaller budget can't fit even one.
    env.DAILY_BUDGET_USD >= TRIAL_RESERVE_USD;
  const featured = findCase(FEATURED_CASE_ID);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Said Who<span className="text-accent">?</span>
        </h1>
        <p className="mt-2 text-lg leading-7 sm:mt-3 sm:text-xl sm:leading-8">
          Ask a chatbot where a quote comes from and it will often guess a source. Said Who? goes and finds the pages
          and their dates, and a check written in plain code, not AI, throws out any snippet that isn&apos;t really on
          the page.
        </p>
        <p className="mt-2 leading-7 text-muted sm:text-lg sm:leading-8">
          Paste a quote you saw online and find out where it first appeared, with a link for every step.
        </p>
      </header>

      {/* What a run ends with comes first, so a first visit sees it before being asked for anything. */}
      {featured && <FeaturedCase example={featured} />}

      {/* Then how it got there, and how often it gets there, before the rest of the cases. */}
      <HowItWorks rejections={REJECTIONS} cases={CASES.length} />
      <EvalNumbers />

      <CaseGallery
        cases={featured ? CASES.filter((c) => c !== featured) : CASES}
        title={featured ? "More finished cases" : undefined}
      />

      <section id="run" aria-labelledby="run-title" className="scroll-mt-6">
        <h2 id="run-title" className="font-serif text-3xl font-semibold">
          Run your own
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Paste any quote and watch the agents look for where it first appeared, step by step.
        </p>
        <div className="mt-6">
          <Investigation
            trialOpen={trialOpen}
            // Only whether a code is needed; the code never leaves the server.
            needsCode={Boolean(env.TRIAL_ACCESS_CODE)}
            savesRuns={runStoreFromEnv(env) !== null}
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
