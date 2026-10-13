// Runs the test set through the agent and scores each run against the known answer.
// Run: pnpm eval [--set main|holdout] [--setup cascade,ultra,lightning] [--only id,id] [--report]
// Any other argument stops the eval, so a typo can't run the main set by mistake.
//
// --set picks the quotes: main (eval/quotes.jsonl, the default) or holdout
// (eval/holdout.jsonl, see eval/README.md). Each set has its own logs and its own
// results file, so the paths below are for main; holdout's logs go to
// .runs/eval-holdout/ and its scores to eval/holdout-results.md.
//
// Each setup runs the same quotes with the same excluded sites as pnpm investigate.
// A run's events go to .runs/eval/<setup>/<id>.json, in the form src/cases/ keeps
// finished cases in. A quote that already has a log there is not run again, so a
// stopped eval picks up where it left off; delete a log to run that quote again.
// A run that hit the spending cap is kept too, and marked in the results, since
// running it again would most likely spend the same and stop at the same place.
// A run a provider spoiled (a rejected key, no credits, a refused request, or an
// outage it didn't make up for) isn't scored: its events go to <id>.failed.json for
// a look, and it runs again next time. The eval stops at an error every later run
// would hit, or after three spoiled runs in a row.
// --report only rebuilds the set's results file from the logs already there.
//
// Each log records the commit the eval ran on and, when src/ had changes that
// weren't committed, a short hash of them, and the results say which code each
// setup's scores came from. Logs from before this have no commit and show as not
// recorded. Without git, or outside a checkout, the commit is null too.
//
// Searches are cached in .runs/eval/search-cache/, page text included, which is
// why it stays out of git. Both sets share it. The same query then gets the same
// pages in every setup, and a search is paid for once. Each run still reports the
// credits its searches cost when they were made, which is what a live run would spend.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { RunEvent } from "../src/agent/events";
import { CASCADE, everyStepOn, MODELS, type ModelPolicy } from "../src/agent/models";
import { ANSWER_SITES, hostOf, investigate } from "../src/agent/orchestrator";
import { parseEvalArgs } from "../src/eval/args";
import { type EvalCase, parseEvalCases } from "../src/eval/cases";
import { type CodeFingerprint, codeLabel, describeCode } from "../src/eval/fingerprint";
import { codeFingerprint, gitIn } from "../src/eval/git-fingerprint";
import { type LogPaths, logPaths, readRunLog, type RunLog } from "../src/eval/logs";
import { renderIntro, renderResults } from "../src/eval/report";
import { providerTrouble, type RunScore, scoreRun, worthScoring } from "../src/eval/score";
import type { EvalSet } from "../src/eval/sets";
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

const REPO = fileURLToPath(new URL("../", import.meta.url));
const RUNS = new URL("../.runs/", import.meta.url);
const CACHE = new URL("eval/search-cache/", RUNS);
// Spoiled runs in a row before the eval stops, so an outage doesn't use up the run.
const MAX_SPOILED_IN_A_ROW = 3;

// A file that exists is taken as finished, so it is written next to its place
// and moved there whole. A write cut off halfway leaves only a .tmp file. The
// process id keeps two evals run at once from sharing one; within a process the
// write and the move are synchronous, so nothing comes between them.
function writeWhole(url: URL, text: string): void {
  const tmp = new URL(`${url.href}.${process.pid}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, url);
}

const readLog = (paths: LogPaths, setup: string, caseId: string): RunLog | null => readRunLog(paths.log(setup, caseId));

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
        writeWhole(url, JSON.stringify(result));
      }
      return result;
    },
  };
}

function writeResults(set: EvalSet, cases: readonly EvalCase[], setups: readonly string[]): void {
  const paths = logPaths(RUNS, set);
  const ranAt: string[] = [];
  const ran = setups
    .map((setup) => {
      const scores: RunScore[] = [];
      const codes: (CodeFingerprint | null)[] = [];
      for (const c of cases) {
        const log = readLog(paths, setup, c.id);
        if (!log) continue;
        ranAt.push(log.ranAt.slice(0, 10));
        codes.push(log.code);
        scores.push(scoreRun(c, log.events));
      }
      return { ...SETUPS[setup], code: describeCode(codes), scores };
    })
    .filter((p) => p.scores.length > 0);
  const results = new URL(`../eval/${set.results}`, import.meta.url);
  writeFileSync(results, `${renderIntro(set, ranAt, ran)}\n${renderResults(cases, ran)}`);
  console.log(`Results: eval/${set.results}`);
}

async function main(): Promise<void> {
  const args = parseEvalArgs(process.argv.slice(2));
  const { set } = args;
  const paths = logPaths(RUNS, set);
  const all = parseEvalCases(readFileSync(new URL(`../eval/${set.file}`, import.meta.url), "utf8"));
  const { only } = args;
  const unknownIds = (only ?? []).filter((id) => !all.some((c) => c.id === id));
  if (unknownIds.length) throw new Error(`no eval case in ${set.file} with id ${unknownIds.join(", ")}`);
  const cases = only ? all.filter((c) => only.includes(c.id)) : all;
  const setups = args.setups ?? Object.keys(SETUPS);
  const unknownSetups = setups.filter((s) => !(s in SETUPS));
  if (unknownSetups.length) throw new Error(`no setup called ${unknownSetups.join(", ")}; use ${Object.keys(SETUPS).join(", ")}`);

  if (args.report) return writeResults(set, all, Object.keys(SETUPS));

  const env = parseServerEnv(process.env);
  const keys = requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"]);
  const nebius = createNebiusClient({ apiKey: keys.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
  const code = codeFingerprint(gitIn(REPO));
  console.log(`Set: ${set.name} (eval/${set.file})\nCode: ${codeLabel(code)}`);
  const spent = { credits: 0 };
  const tavily = cachedSearch(createTavilyClient({ apiKey: keys.TAVILY_API_KEY }), spent);
  mkdirSync(CACHE, { recursive: true });
  for (const setup of setups) mkdirSync(paths.dir(setup), { recursive: true });

  let nebiusUsd = 0;
  let failed = 0;
  let spoiledInARow = 0;
  // Quote by quote, every setup in turn, so the setups search on the same day.
  runs: for (const c of cases) {
    for (const setup of setups) {
      if (readLog(paths, setup, c.id)) continue;
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
      const log = `${JSON.stringify({ caseId: c.id, ranAt, code, events }, null, 2)}\n`;
      const score = scoreRun(c, events);
      // Every attempt is paid for, scored or not.
      nebiusUsd += score.nebiusUsd;
      if (!worthScoring(events)) {
        failed++;
        spoiledInARow++;
        writeWhole(paths.failed(setup, c.id), log);
        const trouble = providerTrouble(events);
        console.log(`${setup.padEnd(10)} ${c.id.padEnd(24)} not scored, the provider failed (${trouble.kinds.join(", ")}); it runs again next time`);
        if (trouble.lasting || spoiledInARow === MAX_SPOILED_IN_A_ROW) {
          console.log(trouble.lasting ? "Stopping: every later run would hit the same error." : `Stopping after ${MAX_SPOILED_IN_A_ROW} spoiled runs in a row.`);
          break runs;
        }
        continue;
      }
      spoiledInARow = 0;
      writeWhole(paths.log(setup, c.id), log);
      rmSync(paths.failed(setup, c.id), { force: true });
      const verdict = score.verdict ? `${score.verdict} ${score.verdictRight ? "✓" : "✗"}` : "no verdict ✗";
      const date = `${score.earliestDate ?? "no date"}${score.earliest === "match" ? " ✓" : score.earliest === "older" ? " (older)" : ""}`;
      console.log(
        `${setup.padEnd(10)} ${c.id.padEnd(24)} ${verdict.padEnd(20)} ${date.padEnd(18)} ` +
          `$${score.nebiusUsd.toFixed(4)}  ${score.tavilyCredits} credits  ${score.seconds}s${score.capped ? "  stopped at the cap" : ""}`,
      );
    }
  }
  console.log(`\nThis eval spent $${nebiusUsd.toFixed(4)} of Nebius (estimated) and ${spent.credits} Tavily credits; cached searches cost nothing.`);
  writeResults(set, all, Object.keys(SETUPS));
  if (failed) process.exitCode = 1;
}

main().catch((err: unknown) => {
  const secrets = [process.env.NEBIUS_API_KEY, process.env.TAVILY_API_KEY];
  console.error("Eval crashed:", err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets).slice(0, 300)}` : "unknown");
  process.exitCode = 1;
});
