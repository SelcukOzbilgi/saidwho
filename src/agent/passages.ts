import { normalizeText } from "./verifier";

// Pages can be huge (one archive.org book came back at ~1M characters), so a
// reader only sees the parts of a page that mention the quote's words.

const WINDOW = 1_500;
const STRIDE = 750;
const MIN_KEYWORD_LENGTH = 4;
const STOPWORDS = new Set(["that", "this", "with", "from", "have", "what", "your", "they", "them", "there", "their", "were", "will", "would", "only", "over", "into", "than", "then", "when"]);

export function keywordsOf(phrases: readonly string[]): string[] {
  const words = phrases.flatMap((p) => normalizeText(p).split(" "));
  return [...new Set(words.filter((w) => w.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(w)))];
}

// Returns the page itself if it fits; otherwise the windows that contain the most
// distinct keywords, in page order, joined with a marker. Each window is an exact
// slice of the page, so a snippet copied from it can still be found in the page.
export function selectPassages(pageText: string, phrases: readonly string[], maxChars: number): string {
  if (pageText.length <= maxChars) return pageText;
  const keywords = keywordsOf(phrases);
  const lower = pageText.toLowerCase();

  const windows: { start: number; score: number }[] = [];
  for (let start = 0; start < pageText.length; start += STRIDE) {
    const slice = normalizeText(lower.slice(start, start + WINDOW));
    const score = keywords.filter((k) => ` ${slice} `.includes(` ${k} `)).length;
    if (score > 0) windows.push({ start, score });
  }
  if (windows.length === 0) return pageText.slice(0, maxChars);

  const picked: number[] = [];
  let used = 0;
  for (const { start } of windows.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (used + WINDOW > maxChars) break;
    if (picked.some((p) => Math.abs(p - start) < WINDOW)) continue;
    picked.push(start);
    used += WINDOW;
  }
  return picked
    .sort((a, b) => a - b)
    .map((start) => pageText.slice(start, start + WINDOW))
    .join("\n[…]\n");
}
