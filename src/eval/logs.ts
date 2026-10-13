import { existsSync, readFileSync } from "node:fs";

import { type RunEvent, runEventSchema } from "../agent/events";
import { type CodeFingerprint, codeFingerprintSchema } from "./fingerprint";

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
