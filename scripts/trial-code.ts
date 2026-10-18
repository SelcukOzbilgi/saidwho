// Makes an access code good for a set number of free trial runs (see
// src/lib/server/trial-codes.ts):
//
//   pnpm trial-code --runs 50 --label judges
//
// The code goes to a file only you can read, ~/.saidwho/codes/<label>.txt
// unless --out names another, and never to the terminal. The terminal gets the
// line to run in the Supabase SQL Editor, which turns the code on and holds
// only its hash. The trial asks for a code only while TRIAL_ACCESS_CODE is set.

import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { newTrialCode, TRIAL_CODE_LABEL, trialCodeInsert } from "../src/lib/server/trial-codes";

const { values } = parseArgs({
  options: {
    runs: { type: "string" },
    label: { type: "string" },
    out: { type: "string" },
  },
});

const runs = Number(values.runs);
const label = values.label ?? "";
if (!values.runs || !TRIAL_CODE_LABEL.test(label)) {
  console.error("Usage: pnpm trial-code --runs <how many runs> --label <name> [--out <file>]");
  console.error("A label is 1 to 60 lowercase letters, digits or -.");
  process.exit(1);
}

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const code = newTrialCode();
let insert = "";
try {
  // Checks runs before anything is written.
  insert = trialCodeInsert(code, label, runs);
} catch (err: unknown) {
  fail(err instanceof Error ? err.message : String(err));
}
const out = resolve(values.out ?? join(homedir(), ".saidwho", "codes", `${label}.txt`));
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
try {
  // "wx" leaves an existing code alone rather than writing over it.
  writeFileSync(out, `${code}\n`, { mode: 0o600, flag: "wx" });
} catch (err: unknown) {
  if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  fail(`${out} already holds a code. Pick another --label or --out.`);
}

console.log(`Wrote a code for ${runs} ${runs === 1 ? "run" : "runs"} to ${out}.`);
console.log("Run this in the Supabase SQL Editor to turn it on:\n");
console.log(insert);
