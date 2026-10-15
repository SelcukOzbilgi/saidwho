import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { type EvalCase, parseEvalCases } from "../eval/cases";

// The test set's answer for each quote, by case id, so a finished case can be
// set next to it. Read once, on the server. The case pages are built ahead of
// time, but the home page is rendered per request; the build traces the file
// into its function (see .next/server/app/page.js.nft.json).
export const KNOWN: ReadonlyMap<string, EvalCase> = new Map(
  parseEvalCases(readFileSync(path.join(process.cwd(), "eval", "quotes.jsonl"), "utf8")).map((c) => [c.id, c]),
);
