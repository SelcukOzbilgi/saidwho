import { normalizeText } from "./verifier";

// Which library pages say something about a cited work. A digital-library search
// also returns the library's own help, guide and search pages, and catalog
// records that list a work without its text. A page like that lacking the saying
// says nothing about the work, so it never counts against the citation.

// Small words that two unrelated titles share.
const STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "into", "upon", "about", "its", "his", "her", "their",
  "les", "des", "une", "der", "die", "das", "und", "von", "del", "ve", "ile", "bir",
]);

// Words long enough to name something: three letters or more, or a year.
const contentWords = (text: string): Set<string> =>
  new Set(normalizeText(text).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word)));

// Whether two names share a word that names something, such as a title word,
// an author's name or a year.
export function sharesWord(a: string, b: string): boolean {
  const words = contentWords(b);
  return [...contentWords(a)].some((word) => words.has(word));
}

// Subdomains that serve the library's own pages or its catalog, not its holdings.
const SITE_PAGE_HOSTS = /^(help|guides|support|blogs?|api|digitization|catalog)\./;
// Paths of search results, help pages and catalog records that list a work
// without its text.
const SITE_PAGE_PATHS = /\/(search|advanced[-_]?search|help|faq|books\/about|record|catalog)(\/|\.|$)/i;

// Fewer characters than this is a record or a menu, not a work's text.
const MIN_WORK_CHARS = 1_000;

// A page that may hold a cited work's text: not the library's front, help or
// search page or a catalog record, long enough to hold text, and titled with a
// word of the work's name.
export function mayHoldWork(url: string, title: string, text: string, work: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.replace(/^www\./, "");
  if (SITE_PAGE_HOSTS.test(host)) return false;
  if (parsed.pathname === "/" || parsed.pathname === "") return false;
  if (SITE_PAGE_PATHS.test(parsed.pathname) || text.length < MIN_WORK_CHARS) return false;
  return sharesWord(title, work);
}
