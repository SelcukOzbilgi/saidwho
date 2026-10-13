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

// What to search next when a query with quotes found nothing: the same query
// with long quoted spans cut to a fragment, or, when none is long, with the
// quotes taken off. null when the query has no quotes to loosen.
export function broaden(query: string): string | null {
  if (!/"[^"]+"/.test(query)) return null;
  const shorter = shortenQuotedSpans(query);
  if (shorter !== query) return shorter;
  return cleanQuery(query.replace(/"/g, " "));
}
