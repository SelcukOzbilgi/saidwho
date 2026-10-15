import { z } from "zod";

import { runEventSchema } from "../agent/events";
import { codeFingerprintSchema } from "../eval/fingerprint";
import { initialRunState, reduceRun, type RunState } from "../lib/run-state";
import beTheChange from "./be-the-change.json";
import enHakikiMursit from "./en-hakiki-mursit.json";
import fasterHorses from "./faster-horses.json";
import fearItself from "./fear-itself.json";
import gelNeOlursanOl from "./gel-ne-olursan-ol.json";
import goodMenDoNothing from "./good-men-do-nothing.json";
import insanitySameThing from "./insanity-same-thing.json";
import letThemEatCake from "./let-them-eat-cake.json";
import soMuchOwed from "./so-much-owed.json";
import thinkYouCan from "./think-you-can.json";

// Finished runs, shown as example cases and replayed from their saved events.
// Each is a quote from the test set (eval/quotes.jsonl) run with
// `pnpm investigate <id>`; the log it writes to .runs/ is copied here as it is
// and added to the list below, in the order the gallery shows them.

const caseLogSchema = z.strictObject({
  caseId: z.string(),
  ranAt: z.iso.datetime(),
  // Which commit ran; logs written before pnpm investigate recorded it have none.
  code: codeFingerprintSchema.nullable().optional(),
  events: z.array(runEventSchema),
});

export type ExampleCase = z.infer<typeof caseLogSchema> & { run: RunState };

export const parseCaseLog = (raw: unknown): z.infer<typeof caseLogSchema> => caseLogSchema.parse(raw);

// A log that doesn't parse fails the build rather than showing a broken case.
export const CASES: readonly ExampleCase[] = [
  insanitySameThing,
  gelNeOlursanOl,
  soMuchOwed,
  beTheChange,
  goodMenDoNothing,
  letThemEatCake,
  fasterHorses,
  thinkYouCan,
  fearItself,
  enHakikiMursit,
].map((raw) => {
  const log = parseCaseLog(raw);
  return { ...log, run: log.events.reduce(reduceRun, initialRunState) };
});

// The case at the top of the home page: a clear verdict, high confidence, and a
// trail where the credit changes hands twice.
export const FEATURED_CASE_ID = "insanity-same-thing";

export const findCase = (id: string): ExampleCase | undefined => CASES.find((c) => c.caseId === id);
