// Runs one eval case through the orchestrator and prints its events.
// Sites that already wrote up the answer are excluded, so the trail has to be found.
// Run: pnpm investigate insanity-same-thing   (a few cents of Nebius, ~5-10 Tavily credits)
// The run's events (snippets only, no page text) go to .runs/, in the same form a replay reads.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import type { EvidenceNode, RunEvent } from "../src/agent/events";
import { ANSWER_SITES, hostOf, investigate } from "../src/agent/orchestrator";
import { cleanDate } from "../src/agent/schemas";
import { parseEvalCases } from "../src/eval/cases";
import { parseServerEnv, requireOwnerKeys } from "../src/lib/server/env-schema";
import { createNebiusClient } from "../src/lib/server/providers/nebius";
import { createTavilyClient } from "../src/lib/server/providers/tavily";
import { redactSecrets } from "../src/lib/server/safe-error";

// A runaway run stops here instead of draining the key.
const MAX_USD = 0.5;

function saveLog(caseId: string, events: readonly RunEvent[]): void {
  mkdirSync(new URL("../.runs/", import.meta.url), { recursive: true });
  const url = new URL(`../.runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${caseId}.json`, import.meta.url);
  writeFileSync(url, `${JSON.stringify({ caseId, events }, null, 2)}\n`);
  console.log(`Log: ${url.pathname}`);
}

const hadDroppedClaim = (n: EvidenceNode): boolean =>
  Boolean(n.reader.attributed_to && !n.attributedTo) ||
  Boolean(cleanDate(n.reader.page_date) && !n.pageDate) ||
  Boolean(cleanDate(n.reader.cited_source_date) && !n.citedSourceDate);

async function main(): Promise<void> {
  const caseId = process.argv[2] ?? "insanity-same-thing";
  const cases = parseEvalCases(readFileSync(new URL("../eval/quotes.jsonl", import.meta.url), "utf8"));
  const evalCase = cases.find((c) => c.id === caseId);
  if (!evalCase) throw new Error(`no eval case with id ${caseId}`);

  const env = parseServerEnv(process.env);
  const keys = requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"]);
  const nebius = createNebiusClient({ apiKey: keys.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
  const tavily = createTavilyClient({ apiKey: keys.TAVILY_API_KEY });

  const events: RunEvent[] = [];
  const nodes: EvidenceNode[] = [];
  const reads = { total: 0, failed: 0, tooLong: 0 };
  let searchCredits = 0;

  const print = (event: RunEvent): void => {
    switch (event.type) {
      case "started":
        console.log(`Quote: "${event.quote}" (usually credited to ${event.popularAttribution})`);
        console.log(`Excluded: ${event.excludeDomains.join(", ")}\n`);
        break;
      case "plan_failed":
        console.log(`1) Planner failed: ${event.reason}`);
        break;
      case "escalated":
        console.log(`   trying again on ${event.to}${event.thinking ? "" : " with thinking off"}: ${event.reason}`);
        break;
      case "planned":
        console.log(`1) Planner (${event.tier}, ${event.latencyMs}ms): ${event.variants.length} variants, ${event.queries.length} queries`);
        for (const q of event.queries) console.log(`   - ${q}`);
        break;
      case "searched":
        searchCredits += event.credits ?? 0;
        break;
      case "search_failed":
        console.log(`   search failed (${event.reason}): ${event.query}`);
        break;
      case "pages_ready":
        console.log(`\n2) Search: ${event.pages} unique pages, ${searchCredits} credits, excluded-site pages dropped: ${event.droppedExcluded}`);
        break;
      case "page_read":
        reads.total++;
        if (event.outcome === "failed") reads.failed++;
        if (event.outcome === "too_long") reads.tooLong++;
        break;
      case "node_added":
        nodes.push(event.node);
        break;
      case "judge_skipped":
      case "verdict":
      case "judge_failed":
        printNodes();
        console.log("\n5) Judge (super)");
        if (event.type === "judge_skipped") console.log(`   skipped: ${event.reason}, so no verdict`);
        if (event.type === "judge_failed") console.log(`   failed: ${event.reason}`);
        if (event.type === "verdict") {
          const j = event.verdict;
          console.log(`   verdict:   ${j.verdict} (${j.confidence})   expected: ${evalCase.verdict}`);
          console.log(`   earliest:  ${j.earliest_author ?? "unknown"}, ${j.earliest_date ?? "?"} [${j.earliest_node ?? "-"}]`);
          console.log(`   expected:  ${evalCase.earliest.author ?? "unknown"}, ${evalCase.earliest.date ?? "?"} (${evalCase.earliest.work})`);
          console.log(`   rationale: ${j.rationale}`);
          if (event.unknownIds.length) {
            console.log(`   UNSUPPORTED verdict points at ids that are not verified nodes: ${event.unknownIds.join(", ")}`);
          }
        }
        break;
      case "budget_exceeded":
        if (reads.total > 0) printNodes();
        console.log(`\nStopped: estimated spend $${event.spentUsd.toFixed(4)} reached the $${event.maxUsd} cap`);
        break;
      case "aborted":
        if (reads.total > 0) printNodes();
        console.log("\nStopped: aborted");
        break;
      case "done":
        console.log(
          `\nCost: $${event.nebiusUsd.toFixed(4)} Nebius (estimated), ${event.tavilyCredits} Tavily credits` +
            (event.unknownCostCalls ? `, plus ${event.unknownCostCalls} calls with unknown cost` : "") +
            `, ${event.seconds}s`,
        );
        break;
    }
  };

  const printNodes = (): void => {
    const verified = nodes.filter((n) => n.check.status !== "not_found");
    console.log(
      `\n3) Readers (lightning): ${reads.total} pages, ${nodes.length} with the quote, ${reads.failed} failed calls, ` +
        `${reads.tooLong} dropped for over-long fields`,
    );
    console.log(
      `4) Verifier: ${verified.length} snippets found in their page, ${nodes.length - verified.length} rejected; ` +
        `${nodes.filter(hadDroppedClaim).length} nodes had a name or date the page doesn't mention (dropped)`,
    );
    const byDate = [...nodes].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
    for (const n of byDate) {
      const mark = n.check.status === "not_found" ? "✗" : "✓";
      const credit = n.attributedTo ?? "no one";
      const cites = n.reader.cited_source ? ` cites: ${n.reader.cited_source.slice(0, 70)}` : "";
      console.log(`   ${mark} ${n.id.padEnd(4)} ${(n.date ?? "????").padEnd(10)} ${n.host.padEnd(28)} → ${credit}${cites}`);
    }
  };

  await investigate({
    nebius,
    tavily,
    input: {
      quote: evalCase.quote,
      popularAttribution: evalCase.popular_attribution,
      language: evalCase.language,
      excludeDomains: [...ANSWER_SITES, ...evalCase.references.map(hostOf)],
    },
    maxUsd: MAX_USD,
    onEvent: (event) => {
      events.push(event);
      print(event);
    },
  });
  saveLog(caseId, events);
  const last = events.at(-1);
  // Exit 0 only when the run reached a verdict, or searched and found nothing to judge.
  // A run whose every search failed found nothing because it looked nowhere.
  const searched = events.some((e) => e.type === "searched");
  const finished = events.some((e) => e.type === "verdict" || (e.type === "judge_skipped" && searched));
  if (!finished || last?.type !== "done") process.exitCode = 1;
}

main().catch((err: unknown) => {
  const secrets = [process.env.NEBIUS_API_KEY, process.env.TAVILY_API_KEY];
  console.error(
    "Investigation crashed:",
    err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets).slice(0, 300)}` : "unknown",
  );
  process.exitCode = 1;
});
