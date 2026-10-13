import { existsSync, readFileSync } from "node:fs";

import { type RunEvent, runEventSchema } from "../agent/events";
import { type CodeFingerprint, codeFingerprintSchema } from "./fingerprint";
import type { EvalSet } from "./sets";

// Reads the run logs pnpm eval writes: { caseId, ranAt, code, events }. Logs from
// before the commit was recorded have no code, and read with code null.

export type RunLog = { ranAt: string; code: CodeFingerprint | null; events: RunEvent[] };

export function parseRunLog(text: string): RunLog {
  const log = JSON.parse(text) as { ranAt: string; code?: unknown; events: unknown[] };
  return {
    ranAt: log.ranAt,
    code: codeFingerprintSchema.nullable().parse(log.code ?? null),
    events: log.events.map((e) => runEventSchema.parse(e)),
  };
}

// null when the quote has no log there yet.
export function readRunLog(url: URL): RunLog | null {
  return existsSync(url) ? parseRunLog(readFileSync(url, "utf8")) : null;
}

// Where a set's logs live under runs (.runs/ in the repo): <set.runs>/<setup>/<id>.json,
// and <id>.failed.json next to it for a run a provider spoiled.
export type LogPaths = {
  dir: (setup: string) => URL;
  log: (setup: string, caseId: string) => URL;
  failed: (setup: string, caseId: string) => URL;
};

export function logPaths(runs: URL, set: EvalSet): LogPaths {
  const dir = (setup: string) => new URL(`${set.runs}/${setup}/`, runs);
  return {
    dir,
    log: (setup, caseId) => new URL(`${caseId}.json`, dir(setup)),
    failed: (setup, caseId) => new URL(`${caseId}.failed.json`, dir(setup)),
  };
}
