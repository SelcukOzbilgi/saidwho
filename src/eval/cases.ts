import { z } from "zod";

// Ground truth for the eval set in eval/quotes.jsonl.
// Every entry comes from a source page that was opened and checked, not from memory.

const partialDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "use YYYY, YYYY-MM or YYYY-MM-DD");

// misattributed: the source names an earlier or real origin.
// no_known_source: the credit is unsupported and no origin is known. If the earliest
// appearance already credits the famous name, leave earliest.author null and give
// misattribution_first_seen the same date as earliest.date.
export const verdictSchema = z.enum(["misattributed", "correct", "contested", "no_known_source"]);

export const evalCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  quote: z.string().min(1),
  language: z.enum(["en", "tr"]),
  popular_attribution: z.string().min(1),
  verdict: verdictSchema,
  earliest: z.strictObject({
    author: z.string().min(1).nullable(),
    work: z.string().min(1),
    date: partialDate.nullable(),
    // Short excerpts only; long passages from source pages are not stored.
    wording: z.string().max(300).nullable(),
  }),
  misattribution_first_seen: partialDate.nullable(),
  references: z.array(z.url({ protocol: /^https$/ })).min(1),
  notes: z.string().min(1),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type Verdict = z.infer<typeof verdictSchema>;

export function parseEvalCases(jsonl: string): EvalCase[] {
  return jsonl
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      const result = evalCaseSchema.safeParse(JSON.parse(line));
      if (!result.success) {
        throw new Error(`eval case on line ${index + 1} is invalid: ${z.prettifyError(result.error)}`);
      }
      return result.data;
    });
}
