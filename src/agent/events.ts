import { z } from "zod";

import { judgeOutputSchema, readerOutputSchema } from "./schemas";

// Everything an investigation does is reported as a stream of events. The same
// events drive the console script, the live page and replays of past runs, so they
// are stored as they are. Page text never goes into an event: only titles, URLs and
// reader fields, which the orchestrator caps at a few hundred characters.

const tierSchema = z.enum(["lightning", "nano", "super", "ultra"]);

// Spend of one model call. usageKnown is false when the provider reported no
// usage or the call failed in a way that may still be billed. tokens are the
// provider's counts, so the same calls can be priced on another tier; runs saved
// before they were kept have no key.
const spendSchema = {
  tier: tierSchema,
  costUsd: z.number(),
  usageKnown: z.boolean(),
  tokens: z.strictObject({ promptTokens: z.number(), completionTokens: z.number() }).optional(),
  latencyMs: z.number(),
};

export const evidenceNodeSchema = z.strictObject({
  id: z.string(),
  url: z.string(),
  host: z.string(),
  title: z.string(),
  check: z.strictObject({ status: z.enum(["exact", "near", "not_found"]), score: z.number() }),
  // What the reader returned, before any claim was checked against the page.
  reader: readerOutputSchema,
  // Reader claims kept only when the page mentions them (see mentionsName/mentionsYear).
  attributedTo: z.string().nullable(),
  pageDate: z.string().nullable(),
  citedSourceDate: z.string().nullable(),
  date: z.string().nullable(),
});

export const runEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("started"),
    quote: z.string(),
    // null when the visitor left the name blank.
    popularAttribution: z.string().nullable(),
    language: z.string(),
    excludeDomains: z.array(z.string()),
  }),
  z.strictObject({
    type: z.literal("planned"),
    ...spendSchema,
    variants: z.array(z.string()),
    candidateAuthors: z.array(z.string()),
    queries: z.array(z.string()),
    // The planner's name for the usual credit, only when the visitor gave none;
    // null otherwise. Runs saved before this field have no key.
    foundAttribution: z.string().nullable().optional(),
  }),
  // A failed plan is tried once more, on Super with thinking off, unless the
  // failure would repeat (a rejected key, no credits, a rate limit, a refused
  // request) or the run must stop; then the run ends here. When the second try
  // fails too, no planned event follows and the run searches for the exact
  // quote alone, with no variants.
  z.strictObject({ type: z.literal("plan_failed"), ...spendSchema, reason: z.string() }),
  // A step is about to be tried again because a check failed: on a bigger model,
  // or on the same one with thinking off when thinking used up the token budget.
  // url names the page for a re-read and is null otherwise.
  z.strictObject({
    type: z.literal("escalated"),
    step: z.enum(["plan", "read", "judge"]),
    from: tierSchema,
    to: tierSchema,
    thinking: z.boolean(),
    reason: z.string(),
    url: z.string().nullable(),
  }),
  z.strictObject({
    type: z.literal("searched"),
    query: z.string(),
    results: z.number(),
    // null when Tavily reported no usage.
    credits: z.number().nullable(),
    latencyMs: z.number(),
  }),
  z.strictObject({ type: z.literal("search_failed"), query: z.string(), reason: z.string() }),
  // Pages on an excluded site are dropped here even if the search let them through.
  z.strictObject({ type: z.literal("pages_ready"), pages: z.number(), droppedExcluded: z.number() }),
  // A page read again after an escalated event reports a second page_read; one
  // page still gives at most one node_added, sent once its last reading is done.
  z.strictObject({
    type: z.literal("page_read"),
    ...spendSchema,
    url: z.string(),
    host: z.string(),
    outcome: z.enum(["evidence", "no_quote", "too_long", "failed"]),
    reason: z.string().nullable(),
  }),
  z.strictObject({ type: z.literal("node_added"), node: evidenceNodeSchema }),
  z.strictObject({ type: z.literal("judge_skipped"), reason: z.string() }),
  // A run can carry two verdicts when Ultra judges again after Super (see
  // escalated); the last one stands.
  z.strictObject({
    type: z.literal("verdict"),
    ...spendSchema,
    verdict: judgeOutputSchema,
    // Ids the verdict cites that are not verified nodes. Non-empty means unsupported.
    unknownIds: z.array(z.string()),
  }),
  z.strictObject({ type: z.literal("judge_failed"), ...spendSchema, reason: z.string() }),
  z.strictObject({ type: z.literal("budget_exceeded"), spentUsd: z.number(), maxUsd: z.number() }),
  z.strictObject({ type: z.literal("aborted") }),
  z.strictObject({
    type: z.literal("done"),
    nebiusUsd: z.number(),
    tavilyCredits: z.number(),
    unknownCostCalls: z.number(),
    seconds: z.number(),
  }),
]);

export type EvidenceNode = z.infer<typeof evidenceNodeSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
