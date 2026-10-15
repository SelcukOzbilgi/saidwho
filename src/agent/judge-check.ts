import type { EvidenceNode } from "./events";
import {
  cleanDate,
  type JudgeOutput,
  type LineageStep,
  MAX_JUDGE_FIELD_CHARS,
  MAX_LINEAGE_STEPS,
  MAX_NOTE_CHARS,
  MAX_RATIONALE_CHARS,
} from "./schemas";

// Plain-code checks on a verdict before it can stand. The model's ids are
// tidied first, since a slip like "[n8]" or "null" says nothing about the
// evidence; what is still not a confirmed page after that makes the verdict
// unsupported. The earliest date is then tied to a page that gives it.

// One id as the model wrote it: a clean id, no id, or something that isn't one id
// at all, such as a list or a range.
export type CanonicalId = { id: string | null } | { malformed: string };

// Brackets, quotes and markdown emphasis models put around an id.
const WRAPPING = /^[\s[\](){}"'`*]+|[\s[\](){}"'`*]+$/g;
const NO_ID = new Set(["", "null", "none", "n/a"]);

export function canonicalId(raw: string | null): CanonicalId {
  if (raw === null) return { id: null };
  const text = raw.replace(WRAPPING, "").toLowerCase();
  if (NO_ID.has(text)) return { id: null };
  return /^n\d+$/.test(text) ? { id: text } : { malformed: raw };
}

// Page ids anywhere in the text, since the verdict card links them wherever
// they are: [n2], [n2, n5], (n2) or a bare n2 all count, in any case.
export const citedIn = (text: string): string[] => (text.match(/\bn\d+\b/gi) ?? []).map((id) => id.toLowerCase());

const yearOf = (date: string | null): string | null => cleanDate(date)?.slice(0, 4) ?? null;
// The years a page gives, from its own date or the date of the source it cites.
// Both were kept only when the page mentions them.
const pageYears = (node: EvidenceNode): string[] =>
  [node.pageDate, node.citedSourceDate].map(yearOf).filter((year): year is string => year !== null);

// Cuts over-long text at the last sentence end inside the limit, or at the limit
// when there is none.
const capText = (text: string, max: number): string => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max / 2 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
};

export type VerdictCheck = {
  // The verdict as it is stored: ids tidied, lineage cut to supported steps, and
  // the earliest date tied to a page or left out.
  verdict: JudgeOutput;
  // Ids the verdict cites that are not confirmed pages, and id fields that hold
  // something other than one id. Non-empty means the verdict can't stand.
  unknownIds: string[];
  // What code changed about the earliest date, for the log.
  fixes: string[];
  // Set when the verdict dates its earliest page by the page's own date though
  // that page names an earlier source with a date: the cited date is when the
  // saying appeared, unless the Judge had a reason. The run asks again, once.
  pageDateOverCited: { node: string; given: string; cited: string } | null;
};

// verified: the confirmed pages the Judge was shown, in page order. guards off
// gives main's checks before these were added, for replays that compare them.
export function checkVerdict(raw: JudgeOutput, verified: readonly EvidenceNode[], guards = true): VerdictCheck {
  const byId = new Map(verified.map((n) => [n.id, n]));
  const unknown = new Set<string>();
  const pointer = (value: string | null): string | null => {
    const id = canonicalId(value);
    if ("malformed" in id) {
      unknown.add(id.malformed);
      return value;
    }
    if (id.id !== null && !byId.has(id.id)) unknown.add(id.id);
    return id.id;
  };

  let earliestNode = pointer(raw.earliest_node);
  const misattributionNode = pointer(raw.misattribution_node);
  for (const id of citedIn(raw.rationale)) if (!byId.has(id)) unknown.add(id);

  // A lineage note with braces in it is JSON the model wrote into the string by
  // mistake, and an over-long one isn't a short note: either step is dropped. A
  // step with no page is dropped too. A step on an id that isn't a confirmed
  // page counts against the verdict, and is left out of it.
  const lineage: LineageStep[] = [];
  for (const step of raw.lineage ?? []) {
    if (/[{}]/.test(step.note) || step.note.length > MAX_NOTE_CHARS) continue;
    const id = canonicalId(step.node);
    if ("malformed" in id) {
      unknown.add(id.malformed);
      continue;
    }
    if (id.id === null) continue;
    const ids = [id.id, ...citedIn(step.note)];
    const missing = ids.filter((i) => !byId.has(i));
    for (const i of missing) unknown.add(i);
    if (missing.length === 0) lineage.push({ ...step, node: id.id });
  }
  // Past the limit, the first step and the last ones are kept: where it started,
  // and the changes that led to the version people share.
  const kept = lineage.length > MAX_LINEAGE_STEPS ? [lineage[0], ...lineage.slice(1 - MAX_LINEAGE_STEPS)] : lineage;

  // The earliest date has to come from a confirmed page. When the page named
  // doesn't give that year and another confirmed page does, that page is named
  // instead: first among the pages the verdict cites, then among the rest, in
  // page order, preferring one the timeline puts in that year (by its cited
  // source's date, else its own). When none does, the date is left out: no page
  // this run checked backs it.
  const fixes: string[] = [];
  let earliestDate = cleanDate(raw.earliest_date);
  const year = yearOf(earliestDate);
  const named = earliestNode !== null ? byId.get(earliestNode) : undefined;
  if (year !== null && !(named && pageYears(named).includes(year))) {
    const givesYear = (pages: readonly EvidenceNode[]) =>
      pages.find((n) => yearOf(n.date) === year) ?? pages.find((n) => pageYears(n).includes(year));
    const cited = new Set([...citedIn(raw.rationale), ...kept.map((step) => step.node)]);
    const backing = givesYear(verified.filter((n) => cited.has(n.id))) ?? givesYear(verified.filter((n) => !cited.has(n.id)));
    if (backing) {
      fixes.push(
        earliestNode !== null
          ? `named ${backing.id} as the earliest page instead of ${earliestNode}: ${backing.id} gives ${year} and ${earliestNode} doesn't`
          : `named ${backing.id} as the earliest page, since it gives ${year}`,
      );
      earliestNode = backing.id;
    } else {
      fixes.push(`left out the earliest date ${earliestDate}: no confirmed page gives ${year}`);
      earliestDate = null;
    }
  }

  // The earliest page names an earlier source with a date, and the verdict gives
  // the page's own, later date. Code never takes the cited date itself: the
  // Judge may have turned that source down (an older fable, a related text), so
  // only a second judge, told about it, can change the date.
  let pageDateOverCited: VerdictCheck["pageDateOverCited"] = null;
  const earliest = earliestNode !== null ? byId.get(earliestNode) : undefined;
  const citedYear = yearOf(earliest?.citedSourceDate ?? null);
  const givenYear = yearOf(earliestDate);
  if (guards && earliest?.citedSourceDate && earliestDate && citedYear && givenYear && citedYear < givenYear) {
    pageDateOverCited = { node: earliest.id, given: earliestDate, cited: earliest.citedSourceDate };
  }

  return {
    verdict: {
      ...raw,
      earliest_node: earliestNode,
      misattribution_node: misattributionNode,
      earliest_date: earliestDate,
      earliest_author: raw.earliest_author?.slice(0, MAX_JUDGE_FIELD_CHARS) ?? null,
      rationale: capText(raw.rationale, MAX_RATIONALE_CHARS),
      lineage: kept,
    },
    unknownIds: [...unknown],
    fixes,
    pageDateOverCited,
  };
}

// How much wording two texts share: the part of one's word pairs the other
// has, taken whichever way gives more, so a snippet that is part of the saying,
// or the saying inside a longer passage, counts in full. Pairs rather than
// single words, since a related idea shares words like "change" and "world"
// without their order. Any language, with no list of words to skip.
export function wordingOverlap(a: string, b: string): number {
  const pairs = (text: string): Set<string> => {
    const words: string[] = text.normalize("NFKC").toLowerCase().replace(/['’]/g, "").match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length < 2) return new Set(words);
    return new Set(words.slice(1).map((word, i) => `${words[i]} ${word}`));
  };
  const share = (from: Set<string>, to: Set<string>) => (from.size === 0 ? 0 : [...from].filter((pair) => to.has(pair)).length / from.size);
  const [pa, pb] = [pairs(a), pairs(b)];
  return Math.max(share(pa, pb), share(pb, pa));
}

// Below this, an earliest page's snippet is worded unlike the saying. In the
// third eval the earliest pages a misattributed verdict rested on scored 0.67 or
// more when they had the saying, and 0.31 or less when they had another text.
export const LOW_OVERLAP = 0.5;

// A misattributed verdict whose earliest page words it unlike the saying and
// doesn't credit the usual name: an older related idea may have been taken for
// the saying, as Bacon's "Nothing is terrible except fear itself" (1605) was for
// Roosevelt's line in the third eval. Code can't tell that from the right origin
// in other words or another language, so a second judge is asked.
export type OtherOrigin = { node: string; snippet: string; overlap: number };

export function otherOrigin(verdict: JudgeOutput, verified: readonly EvidenceNode[], quote: string, credit: string | null): OtherOrigin | null {
  if (verdict.verdict !== "misattributed" || verdict.earliest_node === null) return null;
  const page = verified.find((n) => n.id === verdict.earliest_node);
  const snippet = page?.reader.exact_snippet;
  if (!page || !snippet) return null;
  const overlap = wordingOverlap(quote, snippet);
  if (overlap >= LOW_OVERLAP) return null;
  // The usual name's last word among the page's credit, so "Gandhi" matches
  // "Mahatma Gandhi".
  const words = (text: string | null | undefined): string[] => text?.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const surname = words(credit).at(-1);
  if (surname && words(page.attributedTo).includes(surname)) return null;
  return { node: page.id, snippet, overlap };
}

const MAX_NOTE_SNIPPET = 300;

// What the next judge is told when the last verdict rests on such a page.
export function otherOriginNote({ node, snippet }: OtherOrigin): string {
  const shown = snippet.length > MAX_NOTE_SNIPPET ? `${snippet.slice(0, MAX_NOTE_SNIPPET).trimEnd()}…` : snippet;
  return (
    `Your last verdict rests on page ${node} as an origin other than the usual credit, but its snippet words it very differently: "${shown}". ` +
    `Say whether ${node} has the saying itself or a variant with the same meaning. ` +
    "If it has only a related older idea, a paraphrase or a hypothetical, that is no different origin: name the earliest page that has the saying, and judge the credit again."
  );
}

// What the next judge is told when the last verdict dated its earliest page by
// the page's own date over the earlier source it cites.
// Whether one date comes before another. Dates are "1981", "1981-03" or
// "1981-03-14". Within the same year, only a date at least as precise as the
// other can come first: "2013-01" before "2013-12", but not "2013" before it.
export function earlierDate(date: string, than: string): boolean {
  const year = Number(date.slice(0, 4));
  const thanYear = Number(than.slice(0, 4));
  if (year !== thanYear) return year < thanYear;
  return than.length > 4 && date.length >= than.length && date.slice(0, than.length) < than;
}

export function citedDateNote({ node, given, cited }: NonNullable<VerdictCheck["pageDateOverCited"]>): string {
  return (
    `Your last verdict gave ${given}, the date of page ${node} itself, as the earliest date, but ${node} names a source dated ${cited}. ` +
    `Use ${cited}, name another page, or say in the rationale why ${cited} is not when the saying appeared.`
  );
}

// What the next judge is told when a verdict can't stand.
export function retryNote(unknownIds: readonly string[], allowed: readonly string[]): string {
  const problems = unknownIds.map((id) => (/^n\d+$/.test(id) ? `${id} is not one of the confirmed pages` : `"${id}" is not a single page id`));
  return (
    `Your last verdict was set aside: ${problems.join("; ")}. ` +
    `Cite only these page ids, written exactly like this: ${allowed.join(", ")}. ` +
    "Each id field takes one id or null (not the string \"null\"), never brackets, a list or a range."
  );
}
