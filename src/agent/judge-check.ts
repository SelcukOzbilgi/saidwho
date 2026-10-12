import type { EvidenceNode } from "./events";
import { cleanDate, type JudgeOutput, type LineageStep, MAX_LINEAGE_STEPS, MAX_NOTE_CHARS, MAX_RATIONALE_CHARS } from "./schemas";

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

// Ids in brackets, alone or grouped: [n2], [n2, n5] and [[n2]] all count.
export const citedIn = (text: string): string[] => [...text.matchAll(/\[[^\]]*\]/g)].flatMap((m) => m[0].match(/\bn\d+\b/g) ?? []);

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
};

// verified: the confirmed pages the Judge was shown, in page order.
export function checkVerdict(raw: JudgeOutput, verified: readonly EvidenceNode[]): VerdictCheck {
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
  // doesn't give that year and another confirmed page does, the first such page
  // in page order is named instead, preferring one whose own date is that year. When none does, the date is left out: no
  // page this run checked backs it.
  const fixes: string[] = [];
  let earliestDate = cleanDate(raw.earliest_date);
  const year = yearOf(earliestDate);
  const named = earliestNode !== null ? byId.get(earliestNode) : undefined;
  if (year !== null && !(named && pageYears(named).includes(year))) {
    const backing = verified.find((n) => yearOf(n.date) === year) ?? verified.find((n) => pageYears(n).includes(year));
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

  return {
    verdict: {
      ...raw,
      earliest_node: earliestNode,
      misattribution_node: misattributionNode,
      earliest_date: earliestDate,
      rationale: capText(raw.rationale, MAX_RATIONALE_CHARS),
      lineage: kept,
    },
    unknownIds: [...unknown],
    fixes,
  };
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
