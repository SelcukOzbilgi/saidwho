// Search queries come from models (the planner and the Genealogist), so they are
// checked in code before any goes to Tavily. A query that is only punctuation
// would be refused by the search and make the run look like a provider failure.
// This file has no server imports, so the eval scorer can use the same check.

import { isFunctionWord, normalizeText } from "./verifier";

// Two, so a two-character Chinese title or a three-letter word still goes.
const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 300;
// A quoted span longer than this many words is searched as a fragment of
// FRAGMENT_WORDS. In the first eval, queries quoting a whole long saying came
// back empty far more often than shorter quoted parts of it or unquoted queries.
const LONG_SPAN_WORDS = 10;
const FRAGMENT_WORDS = 8;

// Whitespace collapsed and trimmed, or null when the query can't be a real
// search: no letter at all, under two letters and digits, or over 300 characters.
export function cleanQuery(raw: string): string | null {
  const query = raw.replace(/\s+/g, " ").trim();
  if (query.length > MAX_QUERY_CHARS || !/\p{L}/u.test(query)) return null;
  return normalizeText(query).length >= MIN_QUERY_CHARS ? query : null;
}

export const isValidQuery = (raw: string): boolean => cleanQuery(raw) !== null;

// Models writing JSON sometimes leave markup inside a string: a markdown quote
// mark ("> 640K is enough for all users."), a colon left over from a label
// (':"Twenty years from now…'), or escaped quotes (didn\'t, or
// \"Well-behaved women seldom make history\"). It comes off before a query or
// a wording is used.
export const tidyModelText = (raw: string): string =>
  raw
    .replace(/\\+(["'])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s>:]+/, "")
    .trim();

// Two queries are the same search when they differ only in case, accents or
// punctuation outside the quotes, so a quoted and an unquoted query stay apart.
export const queryKey = (query: string): string => query.split('"').map(normalizeText).join('"');

// The run of FRAGMENT_WORDS words with the most content words, the earliest on a
// tie, with punctuation trimmed off its ends. Content words are what make a
// fragment distinctive: a run heavy with "the", "of" and "and" matches far more
// pages than one made of the saying's nouns and verbs.
function fragmentOf(words: readonly string[]): string {
  const weight = (word: string) => {
    const normal = normalizeText(word);
    return normal && !normal.split(" ").every(isFunctionWord) ? 1 : 0;
  };
  let best = 0;
  let bestScore = -1;
  for (let start = 0; start + FRAGMENT_WORDS <= words.length; start++) {
    const score = words.slice(start, start + FRAGMENT_WORDS).reduce((sum, w) => sum + weight(w), 0);
    if (score > bestScore) [best, bestScore] = [start, score];
  }
  return words
    .slice(best, best + FRAGMENT_WORDS)
    .join(" ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

// Cuts every quoted span longer than LONG_SPAN_WORDS words down to a distinctive
// fragment. A span whose best fragment has no letter in it (a run of dashes or
// ellipses) is left whole rather than turned into an empty search.
export function shortenQuotedSpans(query: string): string {
  return query.replace(/"([^"]+)"/g, (whole, span: string) => {
    const words = span.trim().split(/\s+/);
    if (words.length <= LONG_SPAN_WORDS) return whole;
    const fragment = fragmentOf(words);
    return /\p{L}/u.test(fragment) ? `"${fragment}"` : whole;
  });
}

// A query a model wrote, tidied, with long quoted spans cut down, and checked:
// null when it can't be a search (see cleanQuery).
export const shapeQuery = (raw: string): string | null => cleanQuery(shortenQuotedSpans(tidyModelText(raw)));

// Words a query may add to a quoted saying without asking for anything a search
// for the saying alone wouldn't find: origin, first appearance, source, credit,
// in English, French, German and Turkish, compared after normalizeText.
const GENERIC_ORIGIN_WORDS = new Set(
  (
    "earliest first appearance appeared origin origins source sources quote quotation citation printed published publication " +
    "newspaper book speech magazine verified true real meaning history myth misattributed misattribution attributed attribution " +
    "who said original apocryphal première apparition origine ilk ne zaman söylendi kaynak kaynaklı mı erstveröffentlichung quelle"
  )
    .split(" ")
    .map(normalizeText),
);
const YEAR = /\b(1\d{3}|20[0-2]\d)s?\b/;

// A query that quotes the whole saying again and adds only generic origin words
// ('"Let them eat cake" origin first appearance'): no year, no name, no other
// quoted part. In the saved runs such planner queries mostly returned pages the
// exact-quote search had already found (rule A in the search analysis of
// 2026-10-15). The exact-quote search itself ('"<saying>"') matches too, so a
// caller skips it by identity. A long saying's quoted fragment (see
// shapeQuery) is not the whole saying and doesn't match.
export function isRequoteQuery(query: string, quote: string): boolean {
  const spans = [...query.matchAll(/"([^"]+)"/g)].map((m) => normalizeText(m[1]));
  const saying = normalizeText(quote);
  if (spans.length === 0 || saying === "" || spans.some((span) => span !== saying)) return false;
  if (YEAR.test(query)) return false;
  const rest = normalizeText(query.replace(/"[^"]+"/g, " "));
  return rest === "" || rest.split(" ").every((word) => GENERIC_ORIGIN_WORDS.has(word));
}

// A requote other than the exact-quote search, which every run makes anyway.
// The run leaves these out (see shape in the orchestrator), and rejudge.ts
// --drop-searches requote drops the same ones from a saved run.
export const isExtraRequote = (query: string, quote: string): boolean =>
  queryKey(query) !== queryKey(`"${quote}"`) && isRequoteQuery(query, quote);

// What to search next when a query with quotes found nothing: the same query
// with long quoted spans cut to a fragment, or, when none is long, with the
// quotes taken off. null when the query has no quotes to loosen.
export function broaden(query: string): string | null {
  if (!/"[^"]+"/.test(query)) return null;
  const shorter = shortenQuotedSpans(query);
  if (shorter !== query) return shorter;
  return cleanQuery(query.replace(/"/g, " "));
}
