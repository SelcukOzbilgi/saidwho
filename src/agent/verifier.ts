// The Verifier is plain code, no model. A reader model can invent a passage that
// sounds right, so every snippet it returns is checked against the page text the
// snippet supposedly came from. Anything not found there is rejected.

export type SnippetCheck = {
  status: "exact" | "near" | "not_found";
  // Share of the snippet's three-word sequences that appear in the page, 0..1.
  score: number;
};

// Near matches tolerate OCR noise and small edits, not a different sentence.
const NEAR_MATCH_THRESHOLD = 0.8;
const SHINGLE_SIZE = 3;

// Lowercase, drop accents and punctuation, unify quotes, collapse whitespace.
// Both sides go through the same steps, so dotless ı or ß stay comparable.
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['‘’ʼ`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function shingles(words: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) out.push(words.slice(i, i + SHINGLE_SIZE).join(" "));
  return out;
}

export function checkSnippet(snippet: string, pageText: string): SnippetCheck {
  const needle = normalizeText(snippet);
  if (!needle) return { status: "not_found", score: 0 };
  const haystack = normalizeText(pageText);
  if (` ${haystack} `.includes(` ${needle} `)) return { status: "exact", score: 1 };

  // Too short to judge by overlap; only an exact match counts.
  const needleShingles = shingles(needle.split(" "));
  if (needleShingles.length < 2) return { status: "not_found", score: 0 };

  const pageShingles = new Set(shingles(haystack.split(" ")));
  const found = needleShingles.filter((s) => pageShingles.has(s)).length;
  const score = found / needleShingles.length;
  return { status: score >= NEAR_MATCH_THRESHOLD ? "near" : "not_found", score };
}
