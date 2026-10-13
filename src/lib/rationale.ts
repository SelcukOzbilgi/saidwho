// The Judge writes for a reader but sometimes slips into the words of its own
// output: field names like page_date, "node" for a page, "null" for a blank.
// Its citations come as n3, [n3], (n3, n5), 【n3】 or glued as [n1][n2][n3].
// These helpers make any of that readable, whatever the prompt asked for, and
// leave alone what was quoted or linked: a snippet or a URL shows as written.

// Field names the models see, in the words the page uses for them. Only these
// are renamed; any other word with an underscore may be a name or a title.
const FIELDS: Record<string, string> = {
  page_date: "page date",
  cited_source_date: "cited source's date",
  cited_source: "cited source",
  exact_snippet: "snippet",
  attributed_to: "credit",
  contains_quote: "has the quote",
  earliest_node: "earliest page",
  earliest_date: "earliest date",
  earliest_author: "earliest author",
  misattribution_node: "page with the wrong name",
  from_node: "page it was cited by",
  usual_attribution: "usual credit",
  candidate_authors: "possible authors",
  no_known_source: "no known source",
};

// A verdict is capped well below this when it is made; older saved runs
// weren't, so the page cuts them here before it reads them.
export const MAX_DISPLAY_CHARS = 2_000;

export function capForDisplay(text: string): string {
  if (text.length <= MAX_DISPLAY_CHARS) return text;
  // Don't leave half of a character that takes two code units.
  const end = /[\uD800-\uDBFF]$/.test(text.slice(0, MAX_DISPLAY_CHARS)) ? MAX_DISPLAY_CHARS - 1 : MAX_DISPLAY_CHARS;
  return `${text.slice(0, end)}…`;
}

// URLs and quoted words, which show exactly as written.
const VERBATIM = new RegExp(
  [
    String.raw`https?:\/\/[^\s<>"“”«»]+`,
    "“[^”\\n]*”",
    "„[^“”\\n]*[“”]",
    "«[^»\\n]*»",
    '"[^"\\n]*"',
    // ’ is also an apostrophe, and so is ', so a closing mark can't be followed
    // by a letter, and a straight opening one can't follow one.
    "‘[^’\\n]*’(?![\\p{L}\\p{N}])",
    "(?<![\\p{L}\\p{N}])'[^'\\n]*'(?![\\p{L}\\p{N}])",
  ].join("|"),
  "gu",
);

type Span = { text: string; verbatim: boolean };

function spans(text: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const match of text.matchAll(VERBATIM)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), verbatim: false });
    out.push({ text: match[0], verbatim: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), verbatim: false });
  return out;
}

const keepCase = (word: string, replacement: string): string =>
  /^[A-Z]/.test(word) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;

// Rewrites the Judge's own words; never a quote or a link.
const rewrite = (prose: string): string =>
  prose
    .replace(/\b[A-Za-z]+(?:_[A-Za-z]+)+\b/g, (name) => {
      const words = FIELDS[name.toLowerCase()];
      return words ? keepCase(name, words) : name;
    })
    // A blank field, said the way a person would.
    .replace(/\b(is|are|was|were|remains?|stays?|left|set to) null\b/gi, "$1 not given")
    .replace(/: ?null\b/gi, ": none")
    // The evidence is "pages" everywhere else on the page.
    .replace(/\b([Nn])odes\b/g, (_, n: string) => (n === "N" ? "Pages" : "pages"))
    .replace(/\b([Nn])ode\b/g, (_, n: string) => (n === "N" ? "Page" : "page"));

export function readable(text: string): string {
  return spans(text)
    .map((span) => (span.verbatim ? span.text : rewrite(span.text)))
    .join("");
}

export type Style = "strong" | "em" | null;
export type RationalePart = { text: string; style: Style } | { ids: string[]; style: Style };
type Text = { text: string; style: Style };
type Ids = { ids: string[]; style: Style };
const isIds = (item: RationalePart): item is Ids => "ids" in item;

const WORD = /[\p{L}\p{N}_]/u;
const DIGIT = /[0-9]/;

// Finds ids in prose in one pass: n3, or a run like n1n2n3, standing apart from
// the letters and digits around it. A plain loop, so long or odd text can't
// make it slow.
function scanIds(text: string, style: Style): RationalePart[] {
  const out: RationalePart[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const starts = text[i] === "n" && DIGIT.test(text[i + 1] ?? "") && !WORD.test(text[i - 1] ?? "");
    if (!starts) {
      plain += text[i];
      i += 1;
      continue;
    }
    const ids: string[] = [];
    let j = i;
    while (text[j] === "n" && DIGIT.test(text[j + 1] ?? "")) {
      let k = j + 1;
      while (DIGIT.test(text[k] ?? "")) k += 1;
      ids.push(text.slice(j, k));
      j = k;
    }
    if (WORD.test(text[j] ?? "")) {
      // Part of a word, like n2x: plain text.
      plain += text.slice(i, j);
    } else {
      if (plain) out.push({ text: plain, style });
      plain = "";
      out.push({ ids, style });
    }
    i = j;
  }
  if (plain) out.push({ text: plain, style });
  return out;
}

const atomize = (text: string, style: Style, readably: boolean): RationalePart[] =>
  spans(text).flatMap((span) =>
    span.verbatim ? [{ text: span.text, style }] : scanIds(readably ? rewrite(span.text) : span.text, style),
  );

const PAIRS: Record<string, string> = { "[": "]", "【": "】", "(": ")", "（": "）" };
const OPENERS = Object.keys(PAIRS);

// Only blank space and at most one comma or semicolon. trim() rather than a
// regex, so a long run of spaces stays cheap.
const isSeparator = (text: string): boolean => {
  const core = text.trim();
  return core === "" || (core.length === 1 && ",;、".includes(core));
};

const dropEmpty = (items: RationalePart[]) => items.filter((item) => isIds(item) || item.text !== "");

// Turns runs of ids into groups of chips: brackets around ids go, ids split by
// nothing, a space, a comma or a semicolon join one group, and each id shows
// once in it. Emphasis doesn't split a group; the group takes its first id's style.
function group(input: RationalePart[]): RationalePart[] {
  let items = dropEmpty(input);
  for (let changed = true; changed; ) {
    changed = false;
    // Brackets that hold nothing but ids.
    for (let i = 1; i < items.length - 1; i += 1) {
      const [before, at, after] = [items[i - 1], items[i], items[i + 1]];
      if (!isIds(at) || isIds(before) || isIds(after)) continue;
      const open = OPENERS.find((o) => before.text.endsWith(o));
      if (open && after.text.startsWith(PAIRS[open])) {
        items[i - 1] = { ...before, text: before.text.slice(0, -open.length) };
        items[i + 1] = { ...after, text: after.text.slice(PAIRS[open].length) };
        changed = true;
      }
    }
    // Ids split only by separators.
    const merged: RationalePart[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const last = merged.at(-1);
      if (last && isIds(last) && isIds(item)) {
        merged[merged.length - 1] = { ...last, ids: [...new Set([...last.ids, ...item.ids])] };
        changed = true;
        continue;
      }
      if (last && isIds(last) && !isIds(item)) {
        // Skip this run of text when only separators stand before the next group.
        let j = i;
        let between = "";
        while (j < items.length && !isIds(items[j])) {
          between += (items[j] as Text).text;
          j += 1;
        }
        if (j < items.length && isSeparator(between)) {
          i = j - 1;
          continue;
        }
      }
      merged.push(item);
    }
    items = dropEmpty(merged);
  }

  // A group gets a space from words it was glued to, but not from an opening bracket.
  return items.map((item, i) => {
    if (isIds(item)) return item;
    let text = item.text;
    const [prev, next] = [items[i - 1], items[i + 1]];
    if (next && isIds(next) && !/\s$/.test(text) && !OPENERS.some((o) => text.endsWith(o))) text += " ";
    if (prev && isIds(prev) && /^[\p{L}\p{N}]/u.test(text)) text = ` ${text}`;
    return { ...item, text };
  });
}

export type Part = string | { ids: string[] };

// One run of text without emphasis: its words, with each group of ids apart.
export function splitCitations(text: string): Part[] {
  return group(atomize(text, null, false)).map((item) => (isIds(item) ? { ids: item.ids } : item.text));
}

// What a card shows for a rationale or a lineage note: the text cut to size,
// markdown emphasis as bold or italics (a link is never read as emphasis),
// field names in words, and the ids grouped as chips.
export function parseRationale(text: string): RationalePart[] {
  const pieces = capForDisplay(text).split(/(https?:\/\/\S+|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\b_[^_\n]+_\b)/g);
  return group(
    pieces.flatMap((piece): RationalePart[] => {
      if (/^https?:\/\//.test(piece)) return [{ text: piece, style: null }];
      if (/^\*\*.+\*\*$/.test(piece)) return atomize(piece.slice(2, -2), "strong", true);
      if (/^([*_]).+\1$/.test(piece)) return atomize(piece.slice(1, -1), "em", true);
      return atomize(piece, null, true);
    }),
  );
}
