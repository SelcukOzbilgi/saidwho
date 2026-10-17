import type { Metadata } from "next";
import { connection } from "next/server";

import { Investigation } from "../../components/investigation";
import { SiteFooter } from "../../components/site-footer";
import { env } from "../../lib/server/env";
import { TRIAL_RESERVE_USD } from "../../lib/server/investigate-handler";
import { trialRefusal } from "../../lib/server/run-keys";
import { runStoreFromEnv } from "../../lib/server/run-store";

const description = "Paste any quote and watch the agents look for where it first appeared, step by step.";

export const metadata: Metadata = {
  title: "Run your own · Said Who?",
  description,
  alternates: { canonical: "/run" },
  openGraph: { type: "website", siteName: "Said Who?", title: "Run your own · Said Who?", description, url: "/run" },
  twitter: { card: "summary_large_image", title: "Run your own · Said Who?", description },
};

export default async function RunPage() {
  // Read the switches per request, so turning trial runs off needs no rebuild.
  await connection();
  const trialOpen =
    // The same check the API makes before a trial run.
    trialRefusal(env) === null &&
    // A trial run sets aside its worst case before it starts; a smaller budget can't fit even one.
    env.DAILY_BUDGET_USD >= TRIAL_RESERVE_USD;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 pt-10 pb-10 sm:gap-32 sm:px-6 sm:pt-16 sm:pb-14">
      <section aria-labelledby="run-title">
        <Investigation
          trialOpen={trialOpen}
          // Only whether a code is needed; the code never leaves the server.
          needsCode={Boolean(env.TRIAL_ACCESS_CODE)}
          savesRuns={runStoreFromEnv(env) !== null}
          heading={
            <h1 id="run-title" className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
              Run your own
            </h1>
          }
          intro={description}
        />
      </section>

      <SiteFooter />
    </main>
  );
}
