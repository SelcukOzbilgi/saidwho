import { z } from "zod";

import { verdictSchema } from "../eval/cases";

// Structured outputs for each agent. Every object is strict and every field is
// required (nullable where a value can be missing), which is what
// response_format json_schema with strict: true expects.

export const plannerOutputSchema = z.strictObject({
  // Other wordings the saying may have appeared in, including older or translated forms.
  variants: z.array(z.string()),
  candidate_authors: z.array(z.string()),
  // Web search queries, most promising first.
  queries: z.array(z.string()),
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

export const judgeOutputSchema = z.strictObject({
  verdict: verdictSchema,
  // Node ids such as "n3"; must point at verified evidence.
  earliest_node: z.string().nullable(),
  earliest_author: z.string().nullable(),
  earliest_date: z.string().nullable(),
  misattribution_node: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  rationale: z.string(),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
export type ReaderOutput = z.infer<typeof readerOutputSchema>;
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

// Models write dates loosely ("circa 1981", "October 11, 1981"). Keep a clean
// YYYY, YYYY-MM or YYYY-MM-DD when given one, otherwise fall back to the year.
export function cleanDate(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(trimmed)) return trimmed;
  const year = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(trimmed);
  return year ? year[1] : null;
}
