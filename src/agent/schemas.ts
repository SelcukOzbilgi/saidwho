import { z } from "zod";

import { isRealDate, verdictSchema } from "../eval/cases";

// Structured outputs for each agent. Every object is strict and every field is
// required (nullable where a value can be missing), which is what
// response_format json_schema with strict: true expects.

export const plannerOutputSchema = z.strictObject({
  // Other wordings the saying may have appeared in, including older or translated forms.
  variants: z.array(z.string()),
  candidate_authors: z.array(z.string()),
  // Web search queries, most promising first.
  queries: z.array(z.string()),
  // Who the saying is usually credited to, asked for only when the visitor gave
  // no name. It comes from the model, not from a page.
  usual_attribution: z.string().nullable(),
});

export const readerOutputSchema = z.strictObject({
  contains_quote: z.boolean(),
  // Copied word for word from the page; the Verifier checks it.
  exact_snippet: z.string().nullable(),
  attributed_to: z.string().nullable(),
  page_date: z.string().nullable(),
  // An earlier work the page names as the source of the saying.
  cited_source: z.string().nullable(),
  cited_source_date: z.string().nullable(),
});

// Earlier works the pages cite, picked by the Genealogist to look for next.
export const genealogistOutputSchema = z.strictObject({
  leads: z.array(
    z.strictObject({
      // The node whose citation this follows.
      from_node: z.string(),
      // The work as a library would list it: title and author.
      work: z.string(),
      year: z.string().nullable(),
      // A plain web search query that should find the work's text.
      query: z.string(),
      // The saying's wording in that work, when the citation gives it.
      wording: z.string().nullable(),
    }),
  ),
});

// The most lineage steps a verdict keeps, and the page shows.
export const MAX_LINEAGE_STEPS = 6;
// The longest lineage note, rationale and author name a verdict keeps. Code
// enforces them (see judge-check.ts); the schema sent to the model asks for them too.
export const MAX_NOTE_CHARS = 300;
export const MAX_RATIONALE_CHARS = 1_500;
export const MAX_JUDGE_FIELD_CHARS = 200;

// One step in how the saying got to the form people share: where it first
// appears, then each place its wording, language or credit changed.
const lineageStepSchema = z.strictObject({
  // A node id such as "n3"; must point at verified evidence.
  node: z.string(),
  change: z.enum(["first", "wording", "translation", "credit"]),
  // One short sentence on what changed at this node.
  note: z.string(),
});

// The rationale comes first, so the model writes its reasons before the label
// and the label follows from them.
export const judgeOutputSchema = z.strictObject({
  rationale: z.string(),
  verdict: verdictSchema,
  confidence: z.enum(["low", "medium", "high"]),
  // Node ids such as "n3"; must point at verified evidence.
  earliest_node: z.string().nullable(),
  earliest_author: z.string().nullable(),
  earliest_date: z.string().nullable(),
  misattribution_node: z.string().nullable(),
  // Oldest first.
  lineage: z.array(lineageStepSchema),
});

// A verdict without the lineage, asked for when a full one ran out of tokens
// with thinking off, so the lineage can't cost the run its verdict.
export const compactJudgeOutputSchema = judgeOutputSchema.omit({ lineage: true });

// The same shapes with limits, as sent to the provider: one id per id field,
// a bounded lineage and bounded text. Outputs are still parsed with the schemas
// above, so text over a limit is cut in code rather than failing the call.
const nodeId = z.string().regex(/^n[0-9]+$/);
const boundedText = (max: number) => z.string().max(max);
const boundedLineageStep = lineageStepSchema.extend({ node: nodeId, note: boundedText(MAX_NOTE_CHARS) });
export const boundedJudgeOutputSchema = judgeOutputSchema.extend({
  rationale: boundedText(MAX_RATIONALE_CHARS),
  earliest_node: nodeId.nullable(),
  earliest_author: boundedText(MAX_JUDGE_FIELD_CHARS).nullable(),
  earliest_date: boundedText(MAX_JUDGE_FIELD_CHARS).nullable(),
  misattribution_node: nodeId.nullable(),
  lineage: z.array(boundedLineageStep).max(MAX_LINEAGE_STEPS),
});
export const boundedCompactJudgeOutputSchema = boundedJudgeOutputSchema.omit({ lineage: true });

// A verdict as events carry it. Runs saved before the judge traced the lineage
// have none, so the field is optional here, though the model must always give it.
export const savedJudgeOutputSchema = judgeOutputSchema.extend({ lineage: z.array(lineageStepSchema).optional() });

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
export type ReaderOutput = z.infer<typeof readerOutputSchema>;
export type GenealogistOutput = z.infer<typeof genealogistOutputSchema>;
export type JudgeOutput = z.infer<typeof savedJudgeOutputSchema>;
export type LineageStep = z.infer<typeof lineageStepSchema>;

// Models write dates loosely ("circa 1981", "October 11, 1981"). Keep a clean
// YYYY, YYYY-MM or YYYY-MM-DD when given a real one, otherwise fall back to the
// year ("1981-02-30" becomes "1981").
export function cleanDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(trimmed) && isRealDate(trimmed)) return trimmed;
  const year = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(trimmed);
  return year ? year[1] : null;
}
