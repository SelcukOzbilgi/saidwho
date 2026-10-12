// The Verifier is plain code, no model. A reader model can invent a passage that
// sounds right, so every snippet it returns is checked against the page text the
// snippet supposedly came from. Anything not found there is rejected.

// "exact" means the snippet's words appear on the page in order once both are
// normalized (case, accents, punctuation), not character for character.
export type SnippetCheck = {
  status: "exact" | "near" | "not_found";
  // 1 minus the word edits needed per snippet word, 0..1.
  score: number;
};

// Where a snippet matched, in words of the normalized page text: start is the
// first word, end one past the last. null when it wasn't found.
export type Span = { start: number; end: number };
export type SnippetMatch = SnippetCheck & { span: Span | null };

const SHINGLE_SIZE = 3;
// A near match may differ by one whole word in ten (OCR noise, a dropped
// "again"). Letter-level slips inside a word ("result"/"results") are free.
const WORDS_PER_EDIT = 10;
// Alignments tried per snippet, picked by how many three-word sequences agree.
const CANDIDATE_ALIGNMENTS = 3;
const ALIGNMENT_SLACK = 2;
// Words that flip a sentence's meaning. They must match exactly and can never be
// added, dropped or swapped, so "never" doesn't pass as "ever". Turkish negation
// is mostly a suffix, which the letter-level rule below doesn't loosen for short words.
const NEGATIONS = new Set([
  "not", "no", "nor", "never", "ever", "none", "nothing", "nobody", "nowhere", "neither",
  "cannot", "cant", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "wont", "wouldnt",
  "shouldnt", "couldnt", "without", "degil", "yok", "hic", "asla", "ne",
]);

// Lowercase, drop accents and punctuation, unify quotes, collapse whitespace.
// Dotless ı is folded into i, so AKIL and akıl compare equal like any other case pair.
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/['‘’ʼ`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (NEGATIONS.has(a) || NEGATIONS.has(b)) return false;
  return Math.min(a.length, b.length) >= 4 && levenshtein(a, b) <= 1;
}

// Cost of skipping one word; a negation can't be skipped.
const skipCost = (word: string): number => (NEGATIONS.has(word) ? Infinity : 1);

// Fewest whole-word insertions, deletions or swaps to turn the snippet into some
// contiguous run of the page window (page words before and after are free), and
// where in the window that run ends.
// The snippet's first and last words must match the page: an extra word at the
// edge is how an invented attribution ("Einstein: ...") would slip in.
function wordEdits(snippet: readonly string[], window: readonly string[]): { edits: number; end: number } {
  let prev = new Array<number>(window.length + 1).fill(0);
  for (let i = 1; i <= snippet.length; i++) {
    const edge = i === 1 || i === snippet.length;
    const cur = [edge ? Infinity : prev[0] + skipCost(snippet[i - 1])];
    for (let j = 1; j <= window.length; j++) {
      const [a, b] = [snippet[i - 1], window[j - 1]];
      const swapCost = sameWord(a, b) ? 0 : edge || NEGATIONS.has(a) || NEGATIONS.has(b) ? Infinity : 1;
      const dropSnippetWord = edge ? Infinity : prev[j] + skipCost(a);
      const skipPageWord = cur[j - 1] + skipCost(b);
      cur[j] = Math.min(dropSnippetWord, skipPageWord, prev[j - 1] + swapCost);
    }
    prev = cur;
  }
  const edits = Math.min(...prev);
  return { edits, end: prev.indexOf(edits) };
}

const NOT_FOUND: SnippetMatch = { status: "not_found", score: 0, span: null };

// Footnote numbers glued to a word ("science34") that a reader copying the
// sentence leaves out. Only letters followed by one to three digits, so "640k"
// and years stay as they are.
const stripFootnotes = (words: readonly string[]): string[] => words.map((w) => /^(\p{L}+)\d{1,3}$/u.exec(w)?.[1] ?? w);

// Matches a snippet against the page, then, short of an exact match, against the
// page with footnote numbers taken off word ends, and keeps the better. Both have the same words in the same
// places, so the span is right either way.
export function matchSnippet(snippet: string, pageText: string): SnippetMatch {
  const needle = normalizeText(snippet);
  if (!needle) return NOT_FOUND;
  const pageWords = normalizeText(pageText).split(" ");
  const found = matchWords(needle, pageWords);
  if (found.status === "exact") return found;
  const stripped = stripFootnotes(pageWords);
  if (stripped.every((w, i) => w === pageWords[i])) return found;
  const again = matchWords(needle, stripped);
  const rank = (m: SnippetMatch) => (m.status === "exact" ? 2 : m.status === "near" ? 1 : 0);
  return rank(again) > rank(found) || (rank(again) === rank(found) && again.score > found.score) ? again : found;
}

export function checkSnippet(snippet: string, pageText: string): SnippetCheck {
  const { status, score } = matchSnippet(snippet, pageText);
  return { status, score };
}

function matchWords(needle: string, pageWords: readonly string[]): SnippetMatch {
  const words = needle.split(" ");
  const haystack = ` ${pageWords.join(" ")} `;
  const at = haystack.indexOf(` ${needle} `);
  if (at !== -1) {
    const start = haystack.slice(0, at).split(" ").length - 1;
    return { status: "exact", score: 1, span: { start, end: start + words.length } };
  }

  // Too short to judge by overlap; only an exact match counts.
  if (words.length < SHINGLE_SIZE + 1) return NOT_FOUND;

  // Each three-word sequence the snippet shares with the page votes for an
  // offset (page position minus snippet position). Only the best-supported
  // offsets are aligned word by word, so matches scattered across the page don't add up.
  const positions = new Map<string, number[]>();
  for (let p = 0; p + SHINGLE_SIZE <= pageWords.length; p++) {
    const key = pageWords.slice(p, p + SHINGLE_SIZE).join(" ");
    const list = positions.get(key);
    if (list) list.push(p);
    else positions.set(key, [p]);
  }
  const votes = new Map<number, number>();
  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
    for (const p of positions.get(words.slice(i, i + SHINGLE_SIZE).join(" ")) ?? []) {
      votes.set(p - i, (votes.get(p - i) ?? 0) + 1);
    }
  }
  const offsets = [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_ALIGNMENTS)
    .map(([offset]) => offset);

  let fewest = Infinity;
  let end = 0;
  for (const offset of offsets) {
    const start = Math.max(0, offset - ALIGNMENT_SLACK);
    const window = pageWords.slice(start, offset + words.length + ALIGNMENT_SLACK);
    const aligned = wordEdits(words, window);
    if (aligned.edits < fewest) [fewest, end] = [aligned.edits, start + aligned.end];
  }
  if (fewest === Infinity) return NOT_FOUND;
  const score = Math.max(0, 1 - fewest / words.length);
  const allowed = Math.floor(words.length / WORDS_PER_EDIT);
  if (fewest > allowed) return { status: "not_found", score, span: null };
  // The run may be a word or two longer or shorter than the snippet; close enough to place a date.
  return { status: "near", score, span: { start: Math.max(0, end - words.length), end } };
}

// Short words that carry little of a saying's meaning in the languages quotes
// most often come in, normalized like page text (no accents or apostrophes).
// Leaving them out keeps a page from matching on "the" and "of" alone.
const FUNCTION_WORDS = new Set([
  // English
  "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are",
  "was", "were", "be", "been", "it", "its", "this", "that", "these", "those", "he", "she", "we", "you", "they", "i", "me",
  "my", "his", "her", "our", "your", "their", "them", "him", "us", "so", "do", "does", "did", "have", "has", "had", "will",
  "would", "can", "could", "should", "shall", "may", "might", "must", "than", "then", "there", "what", "which", "who",
  // French, Spanish, German
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "en", "est", "que", "qui", "il", "elle", "ils", "on",
  "el", "los", "las", "y", "o", "es", "se", "lo", "por", "con", "der", "die", "das", "und", "ist", "ein", "eine", "zu",
  // Turkish
  "ve", "bir", "bu", "su", "o", "da", "de", "ki", "mi", "ile", "icin",
]);

// Takes a normalized word.
export const isFunctionWord = (word: string): boolean => FUNCTION_WORDS.has(word);

// How much of a wording a snippet must share to count as carrying it, in
// distinct content words. Either the snippet has this share of the wording's
// words (the whole saying, maybe inside a longer sentence), or this share of the
// snippet's own words come from the wording and there are at least
// MIN_FRAGMENT_WORDS of them (a part of a long saying). Chosen against the first
// eval's logs: at this share no snippet there that holds the saying is
// dropped, and a higher one drops an older wording that shares three of its
// seven content words with the saying.
const SAYING_SHARE = 0.4;
const MIN_FRAGMENT_WORDS = 3;

const contentWords = (text: string): string[] => {
  const words = [...new Set(normalizeText(text).split(" ").filter(Boolean))];
  const content = words.filter((w) => !isFunctionWord(w));
  return content.length > 0 ? content : words;
};

// Whether a snippet carries the saying rather than just some sentence from the
// page, judged against the quote and its known wordings (variants and
// translations the planner gave, or the wording a lead says a work has). A
// note in brackets after a wording ("(French original)") is left out. A word
// counts when it matches the way it would in checkSnippet, so a plural or a
// one-letter slip still does.
export function carriesSaying(snippet: string, wordings: readonly string[]): boolean {
  const have = contentWords(snippet);
  return wordings.some((wording) => {
    const want = contentWords(wording.replace(/\([^)]*\)/g, " "));
    if (want.length === 0) return false;
    const shared = want.filter((w) => have.some((h) => sameWord(w, h))).length;
    const wholeSaying = shared >= Math.min(2, want.length) && shared >= want.length * SAYING_SHARE;
    const fragment = shared >= MIN_FRAGMENT_WORDS && shared >= have.length * SAYING_SHARE;
    return wholeSaying || fragment;
  });
}

// The reader also reports who a page credits and when. Those claims are kept only
// if the page itself backs them: the full name or at least the surname anywhere,
// and the year of a date in the right place (below). Anything else may be the
// model's own guess.
export function mentionsName(name: string, pageText: string): boolean {
  // Possessives would otherwise turn "Brown's" into "browns".
  const withoutPossessive = (text: string) => text.replace(/['’]s\b/g, "");
  const full = normalizeText(withoutPossessive(name.replace(/\([^)]*\)/g, " ")));
  if (!full) return false;
  const page = ` ${normalizeText(withoutPossessive(pageText))} `;
  if (page.includes(` ${full} `)) return true;
  const surname = full.split(" ").at(-1) ?? "";
  return surname.length >= 3 && page.includes(` ${surname} `);
}

// A date the reader gives is kept only when its year sits where it would if it
// were that date, not just anywhere on the page: one page can hold a dozen years
// that belong to other things. Positions are counted in words of the normalized
// page. The numbers were picked by replaying the first eval's readings over
// their pages (see the commit that added them).
// A page's own date sits in its title or near its top, where bylines and a
// book's front matter are, or next to the snippet, as on a dated post.
const PAGE_HEAD_WORDS = 300;
const NEAR_SNIPPET_WORDS = 30;
// A cited work's date sits next to the snippet or next to where the page names
// the work ("in her 1976 article").
const NEAR_SOURCE_WORDS = 20;

const yearPattern = (date: string): RegExp | null => {
  const year = /^\d{4}/.exec(date)?.[0];
  // A year inside a longer number ("119812") isn't that year.
  return year ? new RegExp(`(^|\\D)${year}(\\D|$)`) : null;
};

// Word positions of the date's year among the page's normalized words
// ("1981", "1960s" and "c1981" all count).
const yearPositions = (pattern: RegExp, pageWords: readonly string[]): number[] =>
  pageWords.flatMap((word, i) => (pattern.test(word) ? [i] : []));

const within = (positions: readonly number[], span: Span, words: number): boolean =>
  positions.some((p) => p >= span.start - words && p < span.end + words);

export function keepsPageDate(date: string, page: { title: string; text: string }, span: Span | null): boolean {
  const pattern = yearPattern(date);
  if (!pattern) return false;
  if (pattern.test(page.title)) return true;
  const years = yearPositions(pattern, normalizeText(page.text).split(" "));
  return years.some((p) => p < PAGE_HEAD_WORDS) || (span !== null && within(years, span, NEAR_SNIPPET_WORDS));
}

export function keepsCitedDate(date: string, pageText: string, span: Span | null, citedSource: string | null): boolean {
  const pattern = yearPattern(date);
  if (!pattern) return false;
  const pageWords = normalizeText(pageText).split(" ");
  const years = yearPositions(pattern, pageWords);
  if (span !== null && within(years, span, NEAR_SNIPPET_WORDS)) return true;
  // The work's name, by its longer words: "Narcotics Anonymous" is a better
  // anchor than "the" or "of", and a year in the name would only find itself.
  const names = new Set(
    normalizeText(citedSource ?? "")
      .split(" ")
      .filter((w) => w.length >= 4 && /\p{L}/u.test(w) && !isFunctionWord(w)),
  );
  return pageWords.some((w, i) => names.has(w) && within(years, { start: i, end: i + 1 }, NEAR_SOURCE_WORDS));
}
