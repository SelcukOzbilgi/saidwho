// Runs the test set through the agent and scores each run against the known answer.
// Run: pnpm eval [--setup cascade,ultra,lightning] [--only id,id] [--report]
//
// Each setup runs the same quotes with the same excluded sites as pnpm investigate.
// A run's events go to .runs/eval/<setup>/<id>.json, in the form src/cases/ keeps
// finished cases in. A quote that already has a log there is not run again, so a
// stopped eval picks up where it left off; delete a log to run that quote again.
// --report only rebuilds eval/results.md from the logs already there.
//
// Searches are cached in .runs/eval/search-cache/, page text included, which is
// why it stays out of git. The same query then gets the same pages in every
// setup, and a search is paid for once. Each run still reports the credits its
// searches cost when they were made, which is what a live run would spend.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { type RunEvent, runEventSchema } from "../src/agent/events";
import { CASCADE, everyStepOn, MODELS, type ModelPolicy } from "../src/agent/models";
import { ANSWER_SITES, hostOf, investigate } from "../src/agent/orchestrator";
import { type EvalCase, parseEvalCases } from "../src/eval/cases";
import { renderResults } from "../src/eval/report";
import { type RunScore, scoreRun } from "../src/eval/score";
import { parseServerEnv, requireOwnerKeys } from "../src/lib/server/env-schema";
import { createNebiusClient } from "../src/lib/server/providers/nebius";
import { createTavilyClient, type TavilyClient } from "../src/lib/server/providers/tavily";
import { redactSecrets } from "../src/lib/server/safe-error";

// A runaway run stops here instead of draining the key.
const MAX_USD = 0.5;

const SETUPS: Record<string, { label: string; about: string; models: ModelPolicy }> = {
  cascade: {
    label: "Cascade",
    about:
      "the app as it runs. Lightning reads each page, Super plans, follows citations and judges, " +
      "and a step whose check fails is tried again on a bigger model.",
    models: CASCADE,
  },
  ultra: { label: "All Ultra", about: "every step on Nemotron 3 Ultra.", models: everyStepOn(MODELS.ultra) },
  lightning: { label: "All Lightning", about: "every step on Nemotron 3.5 Lightning.", models: everyStepOn(MODELS.lightning) },
};

const RUNS = new URL("../.runs/eval/", import.meta.url);
const CACHE = new URL("search-cache/", RUNS);
const logUrl = (setup: string, caseId: string) => new URL(`${setup}/${caseId}.json`, RUNS);

function readLog(setup: string, caseId: string): { ranAt: string; events: RunEvent[] } | null {
  const url = logUrl(setup, caseId);
  if (!existsSync(url)) return null;
  const log = JSON.parse(readFileSync(url, "utf8")) as { ranAt: string; events: unknown[] };
  return { ranAt: log.ranAt, events: log.events.map((e) => runEventSchema.parse(e)) };
}

// Only searches that worked are kept; a failed one is tried again next time.
function cachedSearch(tavily: TavilyClient, spent: { credits: number }): TavilyClient {
  return {
    ...tavily,
    search: async (query, options) => {
      const key = createHash("sha256").update(JSON.stringify([query, options ?? null])).digest("hex");
      const url = new URL(`${key}.json`, CACHE);
      if (existsSync(url)) return JSON.parse(readFileSync(url, "utf8"));
      const result = await tavily.search(query, options);
      if (result.ok) {
        spent.credits += result.data.usage?.credits ?? 0;
        writeFileSync(url, JSON.stringify(result));
      }
      return result;
    },
  };
}

function flag(name: string): string[] | null {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return null;
  const values = (process.argv[i + 1] ?? "").split(",").filter(Boolean);
  if (values.length === 0) throw new Error(`--${name} needs a comma-separated list`);
  return values;
}

function writeResults(cases: readonly EvalCase[], setups: readonly string[]): void {
  const ranAt: string[] = [];
  const ran = setups
    .map((setup) => {
      const scores: RunScore[] = [];
      for (const c of cases) {
        const log = readLog(setup, c.id);
        if (!log) continue;
        ranAt.push(log.ranAt.slice(0, 10));
        scores.push(scoreRun(c, log.events));
      }
      return { ...SETUPS[setup], scores };
    })
    .filter((p) => p.scores.length > 0);
  const days = [...new Set(ranAt)].sort();
  const when = days.length === 0 ? "" : days.length === 1 ? ` on ${days[0]}` : ` from ${days[0]} to ${days.at(-1)}`;
  const intro = [
    "# Eval results",
    "",
    `Written by \`pnpm eval\` from runs made${when}. Each quote in [quotes.jsonl](quotes.jsonl) was run with the sites that already wrote up its answer left out: Quote Investigator, Wikiquote, Wikipedia and the pages the answer comes from.`,
    "",
    ...ran.map((p) => `- ${p.label}: ${p.about}`),
    "",
    "Setups that searched for the same query got the same pages, from a shared cache. The Tavily credits are what each setup's searches cost when they were made.",
    "",
    "A ✓ after a verdict means it matches the known answer, and after a year that it's within 2 years of the known earliest date. A year marked (older) is earlier than the known date. That is either a find or a misread date, so those are checked by hand.",
    "",
  ];
  writeFileSync(new URL("../eval/results.md", import.meta.url), `${intro.join("\n")}\n${renderResults(cases, ran)}`);
  console.log("Results: eval/results.md");
}

async function main(): Promise<void> {
  const all = parseEvalCases(readFileSync(new URL("../eval/quotes.jsonl", import.meta.url), "utf8"));
  const only = flag("only");
  const unknownIds = (only ?? []).filter((id) => !all.some((c) => c.id === id));
  if (unknownIds.length) throw new Error(`no eval case with id ${unknownIds.join(", ")}`);
  const cases = only ? all.filter((c) => only.includes(c.id)) : all;
  const setups = flag("setup") ?? Object.keys(SETUPS);
  const unknownSetups = setups.filter((s) => !(s in SETUPS));
  if (unknownSetups.length) throw new Error(`no setup called ${unknownSetups.join(", ")}; use ${Object.keys(SETUPS).join(", ")}`);

  if (process.argv.includes("--report")) return writeResults(all, Object.keys(SETUPS));

  const env = parseServerEnv(process.env);
  const keys = requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"]);
  const nebius = createNebiusClient({ apiKey: keys.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
  const spent = { credits: 0 };
  const tavily = cachedSearch(createTavilyClient({ apiKey: keys.TAVILY_API_KEY }), spent);
  mkdirSync(CACHE, { recursive: true });
  for (const setup of setups) mkdirSync(new URL(`${setup}/`, RUNS), { recursive: true });

  let nebiusUsd = 0;
  let failed = 0;
  // Quote by quote, every setup in turn, so the setups search on the same day.
  for (const c of cases) {
    for (const setup of setups) {
      if (readLog(setup, c.id)) continue;
      const events: RunEvent[] = [];
      const ranAt = new Date().toISOString();
      try {
        await investigate({
          nebius,
          tavily,
          input: {
            quote: c.quote,
            popularAttribution: c.popular_attribution,
            language: c.language,
            excludeDomains: [...ANSWER_SITES, ...c.references.map(hostOf)],
          },
          maxUsd: MAX_USD,
          models: SETUPS[setup].models,
          onEvent: (event) => events.push(event),
        });
      } catch (err: unknown) {
        failed++;
        const secrets = [keys.NEBIUS_API_KEY, keys.TAVILY_API_KEY];
        const why = err instanceof Error ? redactSecrets(err.message, secrets).slice(0, 200) : "unknown";
        console.log(`${setup.padEnd(10)} ${c.id.padEnd(24)} crashed: ${why}`);
        continue;
      }
      writeFileSync(logUrl(setup, c.id), `${JSON.stringify({ caseId: c.id, ranAt, events }, null, 2)}\n`);
      const score = scoreRun(c, events);
      nebiusUsd += score.nebiusUsd;
      const verdict = score.verdict ? `${score.verdict} ${score.verdictRight ? "✓" : "✗"}` : "no verdict ✗";
      const date = `${score.earliestDate ?? "no date"}${score.earliest === "match" ? " ✓" : score.earliest === "older" ? " (older)" : ""}`;
      console.log(
        `${setup.padEnd(10)} ${c.id.padEnd(24)} ${verdict.padEnd(20)} ${date.padEnd(18)} ` +
          `$${score.nebiusUsd.toFixed(4)}  ${score.tavilyCredits} credits  ${score.seconds}s`,
      );
    }
  }
  console.log(`\nThis eval spent $${nebiusUsd.toFixed(4)} of Nebius (estimated) and ${spent.credits} Tavily credits; cached searches cost nothing.`);
  writeResults(all, Object.keys(SETUPS));
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const secrets = [process.env.NEBIUS_API_KEY, process.env.TAVILY_API_KEY];
  console.error("Eval crashed:", err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets).slice(0, 300)}` : "unknown");
  process.exitCode = 1;
});
