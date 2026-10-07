// First end-to-end investigation, one eval case at a time:
// Planner (Super) -> Tavily search -> Readers (Lightning) -> Verifier (code) -> Judge (Super).
// Sites that already wrote up the answer are excluded, so the trail has to be found.
// Run: pnpm investigate insanity-same-thing   (a few cents of Nebius, ~5-10 Tavily credits)
// A run log with snippets only (no page text) goes to .runs/.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { MODELS } from "../src/agent/models";
import { selectPassages } from "../src/agent/passages";
import {
  cleanDate,
  judgeOutputSchema,
  plannerOutputSchema,
  type ReaderOutput,
  readerOutputSchema,
} from "../src/agent/schemas";
import { callStructured } from "../src/agent/structured";
import { checkSnippet, mentionsName, mentionsYear, normalizeText, type SnippetCheck } from "../src/agent/verifier";
import { parseEvalCases } from "../src/eval/cases";
import { parseServerEnv, requireOwnerKeys } from "../src/lib/server/env-schema";
import { createNebiusClient } from "../src/lib/server/providers/nebius";
import { createTavilyClient } from "../src/lib/server/providers/tavily";
import { redactSecrets } from "../src/lib/server/safe-error";

const ANSWER_SITES = ["quoteinvestigator.com", "wikiquote.org", "wikipedia.org"];
const MAX_QUERIES = 5;
const RESULTS_PER_QUERY = 5;
const MAX_PAGES = 20;
const READER_CHARS = 6_000;
// Longer "snippets" are dropped: they may be whole pages, which are never stored.
const MAX_SNIPPET_CHARS = 300;
const READER_CONCURRENCY = 5;

type EvidenceNode = {
  id: string;
  url: string;
  title: string;
  check: SnippetCheck;
  reader: ReaderOutput;
  // Reader claims kept only when the page mentions them (see mentionsName/mentionsYear).
  attributedTo: string | null;
  pageDate: string | null;
  citedSourceDate: string | null;
  date: string | null;
};

function saveLog(caseId: string, log: Record<string, unknown>): void {
  mkdirSync(new URL("../.runs/", import.meta.url), { recursive: true });
  const url = new URL(`../.runs/${new Date().toISOString().replace(/[:.]/g, "-")}-${caseId}.json`, import.meta.url);
  writeFileSync(url, `${JSON.stringify({ caseId, ...log }, null, 2)}\n`);
  console.log(`Log: ${url.pathname}`);
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "invalid-url";
  }
};

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function main(): Promise<void> {
  const caseId = process.argv[2] ?? "insanity-same-thing";
  const cases = parseEvalCases(readFileSync(new URL("../eval/quotes.jsonl", import.meta.url), "utf8"));
  const evalCase = cases.find((c) => c.id === caseId);
  if (!evalCase) throw new Error(`no eval case with id ${caseId}`);

  const env = parseServerEnv(process.env);
  const keys = requireOwnerKeys(env, ["NEBIUS_API_KEY", "TAVILY_API_KEY"]);
  const nebius = createNebiusClient({ apiKey: keys.NEBIUS_API_KEY, baseURL: env.NEBIUS_BASE_URL });
  const tavily = createTavilyClient({ apiKey: keys.TAVILY_API_KEY });
  const excluded = [...new Set([...ANSWER_SITES, ...evalCase.references.map(hostOf)])];

  let nebiusUsd = 0;
  let tavilyCredits = 0;
  // Calls whose spend is unknown (no usage reported, or a possibly billed failure).
  let unknownCostCalls = 0;
  const costLine = () =>
    `$${nebiusUsd.toFixed(4)} Nebius (estimated), ${tavilyCredits} Tavily credits` +
    (unknownCostCalls ? `, plus ${unknownCostCalls} calls with unknown cost` : "");
  const started = performance.now();
  console.log(`Quote: "${evalCase.quote}" (usually credited to ${evalCase.popular_attribution})`);
  console.log(`Excluded: ${excluded.join(", ")}\n`);

  // 1) Planner
  const plan = await callStructured(nebius, {
    model: MODELS.super,
    schema: plannerOutputSchema,
    name: "plan",
    thinking: true,
    maxTokens: 8_000,
    system:
      "You plan a search for the earliest verifiable appearance of a saying. " +
      "List other wordings it may have appeared in (older phrasings, translations into its likely original language), " +
      "people it may really come from, and up to five web search queries. " +
      "The search engine does not support operators such as site:, before:, after:, OR or year ranges; write plain queries. " +
      "Start with the saying in double quotes, then queries about its origin and first appearance " +
      "(for example: earliest newspaper, book or speech where it appeared), and one per candidate author.",
    user: `Saying: "${evalCase.quote}"\nUsually credited to: ${evalCase.popular_attribution}\nLanguage: ${evalCase.language}`,
  });
  nebiusUsd += plan.costUsd;
  if (!plan.usageKnown) unknownCostCalls++;
  if (!plan.ok) {
    console.log(`1) Planner failed: ${plan.reason}\n\nCost: ${costLine()}`);
    saveLog(caseId, { excluded, plan: { failed: plan.reason }, nebiusUsd, tavilyCredits, unknownCostCalls });
    process.exitCode = 1;
    return;
  }
  // The exact phrase always goes first, even if the planner leaves it out (or returns nothing).
  const queries = [`"${evalCase.quote}"`, ...plan.data.queries]
    .filter((q, i, all) => all.findIndex((other) => normalizeText(other) === normalizeText(q)) === i)
    .slice(0, MAX_QUERIES);
  console.log(`1) Planner (super, ${plan.latencyMs}ms): ${plan.data.variants.length} variants, ${queries.length} queries`);
  for (const q of queries) console.log(`   - ${q}`);

  // 2) Search, with page text included so no separate extract call is needed
  const pages = new Map<string, { title: string; text: string }>();
  for (const query of queries) {
    const res = await tavily.search(query, {
      searchDepth: "basic",
      maxResults: RESULTS_PER_QUERY,
      includeRawContent: "text",
      excludeDomains: excluded,
      exactMatch: /"[^"]+"/.test(query),
    });
    if (!res.ok) {
      console.log(`   search failed (${res.error.kind}): ${query}`);
      continue;
    }
    if (res.data.usage) tavilyCredits += res.data.usage.credits;
    else unknownCostCalls++;
    // Only full page text counts. `content` is Tavily's short summary, and a snippet
    // checked against a summary was never checked against the page.
    for (const r of res.data.results) {
      if (r.rawContent && !pages.has(r.url)) pages.set(r.url, { title: r.title, text: r.rawContent });
    }
  }
  // exclude_domains is trusted but enforced here too: an answer site must never reach a reader.
  let leaked = 0;
  for (const url of pages.keys()) {
    const host = hostOf(url);
    if (excluded.some((d) => host === d || host.endsWith(`.${d}`))) {
      pages.delete(url);
      leaked++;
    }
  }
  console.log(`\n2) Search: ${pages.size} unique pages, ${tavilyCredits} credits, excluded-site pages dropped: ${leaked}`);

  // 3) Readers + 4) Verifier
  const phrases = [evalCase.quote, ...plan.data.variants];
  const entries = [...pages.entries()].slice(0, MAX_PAGES);
  const readings = await mapLimit(entries, READER_CONCURRENCY, async ([url, page]) => {
    const passage = selectPassages(page.text, phrases, READER_CHARS);
    const read = await callStructured(nebius, {
      model: MODELS.lightning,
      schema: readerOutputSchema,
      name: "read_page",
      thinking: false,
      maxTokens: 600,
      system:
        "You read one web page for evidence about a saying. Output JSON only. " +
        "contains_quote: the page contains the saying or a close variant. " +
        "exact_snippet: the sentence with the saying, copied character for character from the page, at most 300 characters; null if absent. " +
        "attributed_to: who the page credits, or null. page_date: when this page was published. " +
        "cited_source: an earlier work the page names as where the saying appeared, with cited_source_date. " +
        "Dates as YYYY, YYYY-MM or YYYY-MM-DD; null when the page does not say. Never guess.",
      user: `Saying: "${evalCase.quote}"\nVariants: ${plan.data.variants.join(" | ")}\n\nPage: ${page.title}\nURL: ${url}\n\n${passage}`,
    });
    return { url, page, read };
  });

  const nodes: EvidenceNode[] = [];
  let readerFailures = 0;
  let tooLong = 0;
  for (const { url, page, read } of readings) {
    nebiusUsd += read.costUsd;
    if (!read.usageKnown) unknownCostCalls++;
    if (!read.ok) {
      readerFailures++;
      continue;
    }
    if (!read.data.contains_quote || !read.data.exact_snippet) continue;
    if (read.data.exact_snippet.length > MAX_SNIPPET_CHARS) {
      tooLong++;
      continue;
    }
    const pageText = `${page.title}\n${page.text}`;
    const keepDate = (raw: string | null) => {
      const date = cleanDate(raw);
      return date && mentionsYear(date, pageText) ? date : null;
    };
    const attributedTo = read.data.attributed_to;
    const pageDate = keepDate(read.data.page_date);
    const citedSourceDate = keepDate(read.data.cited_source_date);
    nodes.push({
      id: `n${nodes.length + 1}`,
      url,
      title: page.title,
      check: checkSnippet(read.data.exact_snippet, page.text),
      reader: read.data,
      attributedTo: attributedTo && mentionsName(attributedTo, pageText) ? attributedTo : null,
      pageDate,
      citedSourceDate,
      date: citedSourceDate ?? pageDate,
    });
  }
  const verified = nodes.filter((n) => n.check.status !== "not_found");
  const droppedClaims = nodes.filter(
    (n) =>
      (n.reader.attributed_to && !n.attributedTo) ||
      (cleanDate(n.reader.page_date) && !n.pageDate) ||
      (cleanDate(n.reader.cited_source_date) && !n.citedSourceDate),
  ).length;
  console.log(
    `\n3) Readers (lightning): ${entries.length} pages, ${nodes.length} with the quote, ${readerFailures} failed calls, ` +
      `${tooLong} over-long snippets dropped`,
  );
  console.log(
    `4) Verifier: ${verified.length} snippets found in their page, ${nodes.length - verified.length} rejected; ` +
      `${droppedClaims} nodes had a name or date the page doesn't mention (dropped)`,
  );
  const byDate = [...nodes].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  for (const n of byDate) {
    const mark = n.check.status === "not_found" ? "✗" : "✓";
    const credit = n.attributedTo ?? "no one";
    const cites = n.reader.cited_source ? ` cites: ${n.reader.cited_source.slice(0, 70)}` : "";
    console.log(`   ${mark} ${n.id.padEnd(4)} ${(n.date ?? "????").padEnd(10)} ${hostOf(n.url).padEnd(28)} → ${credit}${cites}`);
  }

  // 5) Judge, on verified evidence only. With none there is nothing to judge.
  const evidence = verified.map((n) => ({
    id: n.id,
    site: hostOf(n.url),
    title: n.title,
    snippet: n.reader.exact_snippet,
    attributed_to: n.attributedTo,
    page_date: n.pageDate,
    cited_source: n.reader.cited_source,
    cited_source_date: n.citedSourceDate,
  }));
  const judge =
    evidence.length === 0
      ? null
      : await callStructured(nebius, {
          model: MODELS.super,
          schema: judgeOutputSchema,
          name: "verdict",
          thinking: true,
          maxTokens: 8_000,
          system:
            "You decide where a saying really comes from, using only the evidence nodes given. Every node's snippet was found on its page; " +
            "attributed_to and dates are given only when the page itself mentions them, otherwise null. " +
            "verdict: misattributed (evidence points to an earlier or different origin), correct (the credited person said it), " +
            "contested (credible evidence conflicts), no_known_source (the credit is unsupported and no origin is found). " +
            "earliest_node: the node with the earliest dated appearance. misattribution_node: the earliest node crediting the famous name, if different. " +
            "earliest_date: when the saying itself first appeared (a node's cited_source_date when it names an earlier source), " +
            "only as YYYY, YYYY-MM or YYYY-MM-DD, or null. earliest_author: only the person's name, or null if unknown. " +
            "In the rationale, cite node ids in brackets like [n2] for every claim. If the evidence is thin, say so and lower confidence.",
          user: `Saying: "${evalCase.quote}"\nUsually credited to: ${evalCase.popular_attribution}\n\nEvidence:\n${JSON.stringify(evidence, null, 1)}`,
        });
  nebiusUsd += judge?.costUsd ?? 0;
  if (judge && !judge.usageKnown) unknownCostCalls++;
  const seconds = ((performance.now() - started) / 1000).toFixed(0);

  console.log("\n5) Judge (super)");
  if (!judge) {
    console.log("   skipped: no verified evidence, so no verdict");
  } else if (!judge.ok) {
    console.log(`   failed: ${judge.reason}`);
  } else {
    const j = judge.data;
    const known = new Set(verified.map((n) => n.id));
    const cited = [...j.rationale.matchAll(/\[(n\d+)\]/g)].map((m) => m[1]);
    const pointers = [j.earliest_node, j.misattribution_node].filter((id): id is string => id !== null);
    const unknown = [...new Set([...cited, ...pointers].filter((id) => !known.has(id)))];
    console.log(`   verdict:   ${j.verdict} (${j.confidence})   expected: ${evalCase.verdict}`);
    console.log(`   earliest:  ${j.earliest_author ?? "unknown"}, ${j.earliest_date ?? "?"} [${j.earliest_node ?? "-"}]`);
    console.log(`   expected:  ${evalCase.earliest.author ?? "unknown"}, ${evalCase.earliest.date ?? "?"} (${evalCase.earliest.work})`);
    console.log(`   rationale: ${j.rationale}`);
    if (unknown.length) console.log(`   UNSUPPORTED verdict points at ids that are not verified nodes: ${unknown.join(", ")}`);
  }
  console.log(`\nCost: ${costLine()}, ${seconds}s`);

  saveLog(caseId, {
    excluded,
    plan: plan.data,
    nodes,
    judge: !judge ? { skipped: "no verified evidence" } : judge.ok ? judge.data : { failed: judge.reason },
    nebiusUsd,
    tavilyCredits,
    unknownCostCalls,
    seconds: Number(seconds),
  });
}

main().catch((err: unknown) => {
  const secrets = [process.env.NEBIUS_API_KEY, process.env.TAVILY_API_KEY];
  console.error(
    "Investigation crashed:",
    err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets).slice(0, 300)}` : "unknown",
  );
  process.exitCode = 1;
});
