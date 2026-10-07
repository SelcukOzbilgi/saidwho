import { normalizeText } from "./verifier";

// Pages can be huge (one archive.org book came back at ~1M characters), so a
// reader only sees the parts of a page that mention the quote's words.

const WINDOW = 1_500;
// The top of a page is always included: dates and bylines usually sit there.
const HEAD = 500;
const MIN_KEYWORD_LENGTH = 4;
const STOPWORDS = new Set(["that", "this", "with", "from", "have", "what", "your", "they", "them", "there", "their", "were", "will", "would", "only", "over", "into", "than", "then", "when"]);

export function keywordsOf(phrases: readonly string[]): string[] {
  const words = phrases.flatMap((p) => normalizeText(p).split(" "));
  return [...new Set(words.filter((w) => w.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(w)))];
}

// Returns the page itself if it fits; otherwise the top of the page plus the
// windows that contain the most distinct keywords, in page order, joined with a
// marker. Each part is an exact slice of the page, so a snippet copied from it can
// still be found in the page.
export function selectPassages(pageText: string, phrases: readonly string[], maxChars: number): string {
  if (pageText.length <= maxChars) return pageText;
  const keywords = keywordsOf(phrases);
  // A budget smaller than one window still gets one (smaller) window.
  const size = Math.min(WINDOW, maxChars);
  const stride = Math.max(1, Math.floor(size / 2));

  const windows: { start: number; score: number }[] = [];
  for (let start = 0; start < pageText.length; start += stride) {
    // Normalize each slice of the original text, not a lowercased copy: lowercasing
    // can change the length (İ becomes two code units) and shift every offset.
    const slice = normalizeText(pageText.slice(start, start + size));
    const score = keywords.filter((k) => ` ${slice} `.includes(` ${k} `)).length;
    if (score > 0) windows.push({ start, score });
  }
  if (windows.length === 0) return pageText.slice(0, maxChars);

  // The head only takes room the windows leave over, so a tight budget still gets a window.
  const head = Math.min(HEAD, Math.max(0, maxChars - size));
  const picked: number[] = [];
  let used = head;
  for (const { start } of windows.sort((a, b) => b.score - a.score || a.start - b.start)) {
    if (used + size > maxChars) break;
    if (start < head || picked.some((p) => Math.abs(p - start) < size)) continue;
    picked.push(start);
    used += size;
  }
  const parts = picked.sort((a, b) => a - b).map((start) => pageText.slice(start, start + size));
  return (head > 0 ? [pageText.slice(0, head), ...parts] : parts).join("\n[…]\n");
}
