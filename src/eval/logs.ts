import { existsSync, readFileSync } from "node:fs";

import { type RunEvent, runEventSchema } from "../agent/events";
import type { Tier } from "../agent/models";
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

// A page a run read, as scripts/rejudge.ts --reread names it: by the node it gave
// ("n13"), by its place among the run's page readings ("#5" for the fifth, a second
// reading included), or by any other text in its URL. Each page once, with the tier
// that read it first, the node it gave if any, and the cited work it was found
// for, if a lead found it.
export type ReadPage = { url: string; host: string; tier: Tier; node: string | null; lookingFor: string | null };

export function readPages(events: readonly RunEvent[], target: string): ReadPage[] {
  const reads = events.flatMap((e) => (e.type === "page_read" ? [e] : []));
  const nodes = events.flatMap((e) => (e.type === "node_added" ? [e.node] : []));
  let urls: string[];
  if (/^n\d+$/.test(target)) urls = nodes.filter((n) => n.id === target).map((n) => n.url);
  else if (/^#\d+$/.test(target)) urls = reads.filter((_, i) => i + 1 === Number(target.slice(1))).map((r) => r.url);
  else urls = reads.filter((r) => r.url.includes(target)).map((r) => r.url);
  return [...new Set(urls)].flatMap((url) => {
    const first = reads.find((r) => r.url === url);
    if (!first) return [];
    return [{ url, host: first.host, tier: first.tier, node: nodes.find((n) => n.url === url)?.id ?? null, lookingFor: first.lookingFor ?? null }];
  });
}
