// Rebuilds what the Judge saw in a saved run, from the run's log and the eval's
// search cache, under main's Checker rules or this code's. The log keeps every
// reading and lead; the cache keeps every page's text. scripts/rejudge.ts uses
// this to judge a saved run again without searching or reading anything.
//
// "main" is the code of main 603995a, the second eval's: dates kept only where
// they sit on the page, a library page counted against a cited work when it is
// 1,000 characters long and shares one word with the work's title, and leads
// whose search returned no such text listed too. "new" is this code's.
//
// Not in a log, and so not replayed: the wording a Genealogist lead gave, and
// any reading again on a bigger model after a reading the Checker now crosses
// out. A page the Checker now crosses out simply drops out of the evidence.
// A page whose text the cache doesn't have keeps its logged reading as it was,
// and is counted in missing, which rejudge.ts reports before it judges.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type EvidenceNode, type RunEvent, runEventSchema } from "../src/agent/events";
import { type CitedWork, citedWork } from "../src/agent/judge";
import { mayHoldWork, namesWork } from "../src/agent/library-pages";
import { hostOf, LIBRARY_SITES } from "../src/agent/orchestrator";
import { cleanDate, type PlannerOutput } from "../src/agent/schemas";
import { carriesSaying, checkSnippet, keepsCitedDate, keptDates, matchSnippet, normalizeText, type Span } from "../src/agent/verifier";

export type Rules = "main" | "new";

type Result = { url: string; title: string; rawContent?: string | null };
type Page = { title: string; text: string };

export type SavedRun = { path: string; caseId: string; ranAt: string; events: RunEvent[] };

export function loadRun(path: string): SavedRun {
  const log = JSON.parse(readFileSync(path, "utf8")) as { caseId: string; ranAt: string; events: unknown[] };
  return { path, caseId: log.caseId, ranAt: log.ranAt, events: log.events.map((e) => runEventSchema.parse(e)) };
}

// Every finished run in the given directories, skipping spoiled ones.
export function loadRuns(dirs: readonly string[]): SavedRun[] {
  return dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.endsWith(".failed.json"))
      .sort()
      .map((f) => loadRun(join(dir, f))),
  );
}

// The last plan a saved run used, as the planner's output, so the eval can run
// the same quote again on the same searches. Throws when there is no such run,
// so a wrong directory doesn't quietly turn into fresh, paid searches.
export function loggedPlan(dir: string, setup: string, caseId: string): PlannerOutput {
  const path = join(dir, setup, `${caseId}.json`);
  if (!existsSync(path)) throw new Error(`no saved run at ${path} to take a plan from`);
  const { events } = loadRun(path);
  const started = events.find((e) => e.type === "started");
  const planned = events.findLast((e) => e.type === "planned");
  if (!planned || planned.type !== "planned") throw new Error(`the run at ${path} has no plan`);
  // The run always searched the exact quote first; the plan is what came after.
  const exact = started?.type === "started" ? `"${started.quote}"` : null;
  return {
    variants: planned.variants,
    candidate_authors: planned.candidateAuthors,
    queries: planned.queries.filter((q) => q !== exact),
    usual_attribution: planned.foundAttribution ?? null,
  };
}

// The eval caches each search by its query and options (see scripts/eval.ts),
// so a saved run's searches can be looked up exactly as they were made.
export class SearchCache {
  constructor(private readonly dir: string) {
    if (!existsSync(dir)) throw new Error(`no search cache at ${dir}`);
  }

  results(query: string, excluded: readonly string[], library: boolean): Result[] | null {
    const options = {
      searchDepth: "basic",
      maxResults: 5,
      includeRawContent: "text",
      excludeDomains: excluded,
      exactMatch: /"[^"]+"/.test(query),
      ...(library && { includeDomains: [...LIBRARY_SITES], includeDomainsMode: "restrict" }),
    };
    const key = createHash("sha256").update(JSON.stringify([query, options])).digest("hex");
    const file = join(this.dir, `${key}.json`);
    if (!existsSync(file)) return null;
    const cached = JSON.parse(readFileSync(file, "utf8")) as { ok: boolean; data?: { results: Result[] } };
    return cached.ok && cached.data ? cached.data.results : null;
  }
}

// main's test for a page's own date, as it was: the year in the title, anywhere
// in the first 300 words, or within 30 words of the snippet. This code's
// keepsPageDate has since stopped counting a year in the opening prose.
function mainKeepsPageDate(date: string, page: Page, span: Span | null): boolean {
  const year = /^\d{4}/.exec(date)?.[0];
  if (!year) return false;
  const pattern = new RegExp(`(^|\\D)${year}(\\D|$)`);
  if (pattern.test(page.title)) return true;
  const years = normalizeText(page.text).split(" ").flatMap((word, i) => (pattern.test(word) ? [i] : []));
  return years.some((p) => p < 300) || (span !== null && years.some((p) => p >= span.start - 30 && p < span.end + 30));
}

// main's dates: kept only where they sit on the page.
export function mainDates(reading: EvidenceNode["reader"], page: Page, span: Span | null) {
  const keep = (raw: string | null, placed: (date: string) => boolean) => {
    const date = cleanDate(raw);
    return date && placed(date) ? date : null;
  };
  return {
    pageDate: keep(reading.page_date, (date) => mainKeepsPageDate(date, page, span)),
    citedSourceDate: keep(reading.cited_source_date, (date) => keepsCitedDate(date, page, span, reading.cited_source)),
  };
}

// main's test for a page that may hold a cited work's text.
function mainMayHoldWork(url: string, title: string, text: string, work: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (/^(help|guides|support|blogs?|api|digitization|catalog)\./.test(host)) return false;
  if (parsed.pathname === "/" || parsed.pathname === "") return false;
  if (/\/(search|advanced[-_]?search|help|faq|books\/about|record|catalog)(\/|\.|$)/i.test(parsed.pathname) || text.length < 1_000) return false;
  const stop = new Set(["the", "and", "for", "from", "with", "into", "upon", "about", "its", "his", "her", "their", "les", "des", "une", "der", "die", "das", "und", "von", "del", "ve", "ile", "bir"]);
  const words = (s: string) => new Set(normalizeText(s).split(" ").filter((w) => w.length >= 3 && !stop.has(w)));
  const workWords = words(work);
  return [...words(title)].some((w) => workWords.has(w));
}

export type Evidence = {
  quote: string;
  credit: string | null;
  verified: EvidenceNode[];
  citedWorks: CitedWork[];
  // Pages whose text the cache didn't have, and lead searches it didn't have.
  missing: { pages: number; leads: number };
};

const order = (id: string) => Number(id.slice(1));
const onLibrarySite = (url: string) => {
  const host = hostOf(url);
  return LIBRARY_SITES.some((site) => host === site || host.endsWith(`.${site}`));
};

// Where the first round of searches ends: at the first pages_ready, or at the end
// when a run stopped before one, so all its searches are first-round ones.
const firstRoundEnd = (events: readonly { type: string }[]): number => {
  const at = events.findIndex((e) => e.type === "pages_ready");
  return at === -1 ? events.length : at;
};

// The text a first-round page's reader saw: the first search result with that page.
export function firstPageOf(run: SavedRun, url: string, cache: SearchCache): Page | null {
  const started = run.events.find((e) => e.type === "started");
  if (!started || started.type !== "started") return null;
  const firstPagesAt = firstRoundEnd(run.events);
  for (const [i, e] of run.events.entries()) {
    if (e.type !== "searched" || i > firstPagesAt) continue;
    const hit = (cache.results(e.query, started.excludeDomains, false) ?? []).find((r) => r.url === url && r.rawContent);
    if (hit) return { title: hit.title, text: hit.rawContent ?? "" };
  }
  return null;
}

export function rebuildEvidence(run: SavedRun, rules: Rules, cache: SearchCache): Evidence {
  const { events } = run;
  const started = events.find((e) => e.type === "started");
  if (!started || started.type !== "started") throw new Error(`${run.path}: no started event`);
  const planned = events.findLast((e) => e.type === "planned");
  const variants = planned?.type === "planned" ? planned.variants : [];
  const quote = started.quote;
  const credit = started.popularAttribution ?? (planned?.type === "planned" ? (planned.foundAttribution ?? null) : null);
  const excluded = started.excludeDomains;
  const isExcluded = (url: string) => {
    const host = hostOf(url);
    return excluded.some((d) => host === d || host.endsWith(`.${d}`));
  };

  // The searches in the order made: the first round before the first pages_ready,
  // the Genealogist's after, restricted to libraries.
  const firstPagesAt = firstRoundEnd(events);
  const searches = events.flatMap((e, i) => (e.type === "searched" ? [{ query: e.query, library: i > firstPagesAt }] : []));
  const missing = { pages: 0, leads: 0 };
  const resultsOf = new Map<string, Result[] | null>();
  const results = (query: string, library: boolean) => {
    const key = `${library}|${query}`;
    if (!resultsOf.has(key)) resultsOf.set(key, cache.results(query, excluded, library));
    return resultsOf.get(key) ?? null;
  };
  // Every text the run got for each page, and the first, which its reader saw.
  const textsOf = new Map<string, string[]>();
  const firstPage = new Map<string, Page>();
  for (const { query, library } of searches) {
    for (const r of results(query, library) ?? []) {
      if (!r.rawContent) continue;
      textsOf.set(r.url, [...new Set([...(textsOf.get(r.url) ?? []), r.rawContent])]);
      if (!library && !firstPage.has(r.url)) firstPage.set(r.url, { title: r.title, text: r.rawContent });
    }
  }
  // Leads and the pages each one's search returned.
  const leads = events.flatMap((e) => (e.type === "traced" ? e.leads : []));
  const leadResults = new Map(leads.map((lead) => [lead.work, searches.some((s) => s.library && s.query === lead.query) ? results(lead.query, true) : null]));
  for (const lead of leads) if (searches.some((s) => s.library && s.query === lead.query) && leadResults.get(lead.work) === null) missing.leads++;

  // The nodes, checked again under the rules.
  const nodes = events.flatMap((e) => (e.type === "node_added" ? [e.node] : []));
  const rebuilt = nodes.map((logged) => {
    const fromLead = logged.foundVia ? (leadResults.get(logged.foundVia.work) ?? []).find((r) => r.url === logged.url && r.rawContent) : undefined;
    const page: Page | undefined = fromLead ? { title: fromLead.title, text: fromLead.rawContent ?? "" } : firstPage.get(logged.url);
    if (!page) {
      missing.pages++;
      return logged;
    }
    const reading = logged.reader;
    const snippet = reading.exact_snippet ?? "";
    const match = matchSnippet(snippet, page.text);
    const check: EvidenceNode["check"] =
      match.status !== "not_found" && !carriesSaying(snippet, [quote, ...variants])
        ? { status: "not_found", score: match.score, reason: "not_the_saying" }
        : { status: match.status, score: match.score };
    const dates = rules === "main" ? mainDates(reading, page, match.span) : keptDates(reading, page, match.span);
    return { ...logged, check, ...dates, date: dates.citedSourceDate ?? dates.pageDate };
  });
  const confirmed = rebuilt.filter((n) => n.check.status !== "not_found");

  // The cited works, settled as the orchestrator settles them.
  const reads = events.flatMap((e) => (e.type === "page_read" ? [e] : []));
  const readUrls = new Set(reads.map((r) => r.url));
  const nodeUrls = new Set(nodes.map((n) => n.url));
  const noQuoteUrls = new Set(reads.filter((r) => r.outcome === "no_quote" && !nodeUrls.has(r.url)).map((r) => r.url));
  const quoteWords = normalizeText(quote).split(" ").length;
  const aboutAsLong = (snippet: string) => {
    const words = normalizeText(snippet).split(" ").length;
    return words >= Math.max(4, Math.ceil(quoteWords / 2)) && words <= quoteWords * 2;
  };
  const knownWordings = [quote, ...variants, ...confirmed.flatMap((n) => (n.reader.exact_snippet && aboutAsLong(n.reader.exact_snippet) ? [n.reader.exact_snippet] : []))];
  const holdsSaying = (text: string) => knownWordings.some((phrase) => checkSnippet(phrase, text).status !== "not_found");
  const holds = rules === "new" ? mayHoldWork : mainMayHoldWork;
  const citedWorks = leads.flatMap((lead): CitedWork[] => {
    const found = leadResults.get(lead.work);
    if (!found) return [];
    const usable = found.filter((r) => !isExcluded(r.url));
    const urls = usable.map((r) => r.url);
    if (urls.some((url) => readUrls.has(url) && !noQuoteUrls.has(url))) return [];
    if (urls.some((url) => (textsOf.get(url) ?? []).some(holdsSaying))) return [];
    const taken = reads.filter((r) => r.lookingFor === lead.work && noQuoteUrls.has(r.url));
    const pages = usable
      .filter((r) => r.rawContent && taken.some((t) => t.url === r.url) && holds(r.url, r.title, r.rawContent, lead.work))
      .map((r) => ({ site: hostOf(r.url), title: r.title.slice(0, 300) }));
    if (rules === "main") {
      if (!usable.some((r) => r.rawContent && mainMayHoldWork(r.url, r.title, r.rawContent, lead.work))) {
        return [{ cited_by: lead.fromNode, work: lead.work, checked: `The digital-library search for ${lead.work} returned no text of the work.` } as CitedWork];
      }
      const sites = [...new Set(pages.map((p) => p.site))].join(" and ");
      const checked = `Pages found for ${lead.work} on ${sites} don't have the saying in any wording this run knows.`;
      return pages.length ? [{ cited_by: lead.fromNode, work: lead.work, checked, pages }] : [];
    }
    if (confirmed.some((n) => onLibrarySite(n.url) && namesWork(n.title, lead.work))) return [];
    return pages.length ? [citedWork(lead.fromNode, lead.work, pages)] : [];
  });

  return { quote, credit, verified: confirmed.sort((a, b) => order(a.id) - order(b.id)), citedWorks, missing };
}
