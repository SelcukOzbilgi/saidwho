// The Verifier is plain code, no model. A reader model can invent a passage that
// sounds right, so every snippet it returns is checked against the page text the
// snippet supposedly came from. Anything not found there is rejected.

export type SnippetCheck = {
  status: "exact" | "near" | "not_found";
  // 1 minus the word edits needed per snippet word, 0..1.
  score: number;
};

const SHINGLE_SIZE = 3;
// A near match may differ by one whole word in ten (OCR noise, a dropped
// "again"). Letter-level slips inside a word ("result"/"results") are free.
const WORDS_PER_EDIT = 10;
// Alignments tried per snippet, picked by how many three-word sequences agree.
const CANDIDATE_ALIGNMENTS = 3;
const ALIGNMENT_SLACK = 2;

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
  return a === b || (Math.min(a.length, b.length) >= 4 && levenshtein(a, b) <= 1);
}

// Fewest whole-word insertions, deletions or swaps to turn the snippet into some
// contiguous run of the page window (page words before and after are free).
// The snippet's first and last words must match the page: an extra word at the
// edge is how an invented attribution ("Einstein: ...") would slip in.
function wordEdits(snippet: readonly string[], window: readonly string[]): number {
  let prev = new Array<number>(window.length + 1).fill(0);
  for (let i = 1; i <= snippet.length; i++) {
    const edge = i === 1 || i === snippet.length;
    const cur = [edge ? Infinity : i];
    for (let j = 1; j <= window.length; j++) {
      const match = sameWord(snippet[i - 1], window[j - 1]);
      const swap = prev[j - 1] + (match ? 0 : edge ? Infinity : 1);
      cur[j] = Math.min(edge ? Infinity : prev[j] + 1, cur[j - 1] + 1, swap);
    }
    prev = cur;
  }
  return Math.min(...prev);
}

export function checkSnippet(snippet: string, pageText: string): SnippetCheck {
  const needle = normalizeText(snippet);
  if (!needle) return { status: "not_found", score: 0 };
  const haystack = normalizeText(pageText);
  if (` ${haystack} `.includes(` ${needle} `)) return { status: "exact", score: 1 };

  // Too short to judge by overlap; only an exact match counts.
  const words = needle.split(" ");
  if (words.length < SHINGLE_SIZE + 1) return { status: "not_found", score: 0 };

  // Each three-word sequence the snippet shares with the page votes for an
  // offset (page position minus snippet position). Only the best-supported
  // offsets are aligned word by word, so matches scattered across the page don't add up.
  const pageWords = haystack.split(" ");
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
  for (const offset of offsets) {
    const start = Math.max(0, offset - ALIGNMENT_SLACK);
    const window = pageWords.slice(start, offset + words.length + ALIGNMENT_SLACK);
    fewest = Math.min(fewest, wordEdits(words, window));
  }
  if (fewest === Infinity) return { status: "not_found", score: 0 };
  const score = Math.max(0, 1 - fewest / words.length);
  const allowed = Math.floor(words.length / WORDS_PER_EDIT);
  return { status: fewest <= allowed ? "near" : "not_found", score };
}

// The reader also reports who a page credits and when. Those claims are kept only
// if the page itself mentions them: the full name or at least the surname, and
// the year of a date. Anything else may be the model's own guess.
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

export function mentionsYear(date: string, pageText: string): boolean {
  const year = /^\d{4}/.exec(date)?.[0];
  return Boolean(year) && new RegExp(`(^|\\D)${year}(\\D|$)`).test(pageText);
}
