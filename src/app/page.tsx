import { connection } from "next/server";

import { CASES } from "../cases/cases";
import { CaseGallery } from "../components/case-gallery";
import { Investigation } from "../components/investigation";
import { SiteFooter } from "../components/site-footer";
import { env } from "../lib/server/env";

export default async function Home() {
  // Read the switches per request, so turning trial runs off needs no rebuild.
  await connection();
  const trialOpen =
    env.LIVE_RUNS_ENABLED &&
    env.TRIAL_RUNS_ENABLED &&
    Boolean(env.NEBIUS_API_KEY && env.TAVILY_API_KEY) &&
    env.DAILY_BUDGET_USD > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="font-serif text-5xl font-semibold tracking-tight">
          Said Who<span className="text-accent">?</span>
        </h1>
        <p className="mt-3 text-lg leading-8 text-muted">
          Paste a quote you saw online and find out where it first appeared, with a link for every step.
        </p>
      </header>

      <Investigation trialOpen={trialOpen} />

      <CaseGallery cases={CASES} />

      <SiteFooter />
    </main>
  );
}
