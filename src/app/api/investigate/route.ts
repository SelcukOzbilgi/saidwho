import { ANSWER_SITES, investigate } from "@/agent/orchestrator";
import { createDailyLedger } from "@/lib/server/daily-budget";
import { env } from "@/lib/server/env";
import { createInvestigateHandler } from "@/lib/server/investigate-handler";
import { createNebiusClient } from "@/lib/server/providers/nebius";
import { createTavilyClient } from "@/lib/server/providers/tavily";
import { runStoreFromEnv } from "@/lib/server/run-store";

// A run is usually under a minute; the handler ends it well before this (RUN_DEADLINE_MS).
export const maxDuration = 300;

// Answer sites are left out of live runs too, so what you see is the agent
// finding the trail itself, as in the test set.
export const POST = createInvestigateHandler({
  env,
  ledger: createDailyLedger(env.DAILY_BUDGET_USD),
  excludeDomains: ANSWER_SITES,
  createNebius: createNebiusClient,
  createTavily: createTavilyClient,
  investigate,
  store: runStoreFromEnv(env),
});
