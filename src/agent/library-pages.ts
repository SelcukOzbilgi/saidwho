import { normalizeText } from "./verifier";

// Which library pages say something about a cited work. A digital-library search
// also returns the library's own help, guide and search pages, catalog records
// and item pages that list a work without its text, and other works that share
// a word with its title. A page like that lacking the saying says nothing about
// the work, so it never counts against the citation.

// Small words that two unrelated titles share.
const STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "into", "upon", "about", "its", "his", "her", "their",
  "les", "des", "une", "der", "die", "das", "und", "von", "del", "ve", "ile", "bir",
]);

// Words that say what kind of thing a work is, or when, rather than which one:
// "Microcomputing Magazine (May 1983)" shares "May" with "InfoWorld (May 11,
// 1981)", and "The Washington Historical Quarterly" shares "Quarterly" with "The
// Cruise Industry News Quarterly". Years and other numbers count with these.
const GENERIC = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "vol", "volume", "volumes", "book", "books", "part", "chapter", "issue", "edition", "works", "complete", "collected",
  "selected", "journal", "quarterly", "monthly", "weekly", "daily", "magazine", "review", "news", "literature", "text",
  "full", "free", "download", "online", "library", "archive", "internet", "project", "gutenberg", "ebook", "wikisource",
]);
const isGeneric = (word: string): boolean => GENERIC.has(word) || /^\d+$/.test(word);

// Words long enough to name something: three letters or more, or a year.
const contentWords = (text: string): Set<string> =>
  new Set(normalizeText(text).split(" ").filter((word) => word.length >= 3 && !STOPWORDS.has(word)));

// "Volume 12", "Vol. XII" and "Book VI" name a part of a work, not the work.
// Roman numerals only in capitals, so "Book Civil" keeps its word.
const PART = /\b(?:[Vv]ol(?:ume)?|VOL(?:UME)?|[Bb]ook|BOOK|[Pp]art|PART|[Cc]hapter|CHAPTER|[Nn]o|NO)\.?\s*([0-9]+|[IVXLCDM]+)\b/g;
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const partNumber = (raw: string): number =>
  /^\d+$/.test(raw)
    ? Number(raw)
    : [...raw.toLowerCase()].reduce((sum, ch, i, all) => (ROMAN[ch] < (ROMAN[all[i + 1]] ?? 0) ? sum - ROMAN[ch] : sum + ROMAN[ch]), 0);
const volumeOf = (text: string): number | null => {
  const found = /\b(?:[Vv]ol(?:ume)?|VOL(?:UME)?)\.?\s*([0-9]+|[IVXLCDM]+)\b/.exec(text);
  return found ? partNumber(found[1]) : null;
};

// Whether a page title names the work. The title part of the work's name, before
// "by" or "edited by" and with its part numbers left out, must share two of its
// words with the page title (one when it has only one, as "Confessions by
// Rousseau" does), and one of them must name this work rather than a kind of
// work or a date. The author's name alone is no match. A title that names
// another volume of the same series is another work.
export function namesWork(title: string, work: string): boolean {
  const workVolume = volumeOf(work);
  const titleVolume = volumeOf(title);
  if (workVolume !== null && titleVolume !== null && workVolume !== titleVolume) return false;
  // A year after the title ("Confessions (1782)", "Nature, 1836") dates an
  // edition, so it isn't one of the words to share. A number in the title itself
  // stays ("Fahrenheit 451", "1984"), and so do words like "Journal", since "The
  // Journal of Education" isn't "Jesuit education".
  const name = work.replace(PART, " ").replace(/\(\s*\d{4}\s*\)|,\s*\d{4}(?=\s|$)/g, " ");
  const titleWords = [...contentWords(normalizeText(name).split(/ (?:edited )?by /)[0])];
  const have = contentWords(title);
  const shared = titleWords.filter((word) => have.has(word));
  return shared.length >= Math.min(2, titleWords.length) && shared.some((word) => !isGeneric(word));
}

// Subdomains that serve the library's own pages or its catalog, not its holdings.
const SITE_PAGE_HOSTS = /^(help|guides|support|blogs?|api|digitization|catalog)\./;
// Paths of search results, help pages and catalog records that list a work
// without its text.
const SITE_PAGE_PATHS = /\/(search|advanced[-_]?search|help|faq|books\/about|record|catalog)(\/|\.|$)/i;
// An item's own page, which describes it and links to its files: archive.org's
// /details/<item> and Project Gutenberg's /ebooks/<number>.
const ITEM_PAGE_PATHS = /^\/(details\/[^/]+|ebooks\/\d+)\/?$/i;

// Fewer characters than this is a record, a contents page or a menu, not a work's
// text. The library pages the first two evals counted against a work ran from
// 1,000 to 7,000 characters when they were shells, and from 55,000 up when they
// held a work's text.
const MIN_WORK_CHARS = 10_000;

// A page that may hold a cited work's text: not the library's front, help or
// search page, a catalog record or an item page, long enough to hold text, and
// titled after the work (see namesWork).
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
  if (SITE_PAGE_PATHS.test(parsed.pathname) || ITEM_PAGE_PATHS.test(parsed.pathname)) return false;
  if (text.length < MIN_WORK_CHARS) return false;
  return namesWork(title, work);
}
