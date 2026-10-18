import { z } from "zod";

import { verdictSchema } from "../eval/cases";
import { isRunId } from "./run-id";

// The runs a visitor started from this browser, newest first, so the run page
// can list them again after the run itself is gone from the screen. Only runs
// the server saved are kept, since each needs its page at /runs/<id>; there
// are no accounts, so the list lives in this browser's localStorage and
// nowhere else. It holds what the card shows and nothing more.

export const HISTORY_KEY = "saidwho:runs:v1";
export const HISTORY_MAX = 24;
// Sent when this tab changes the list; the storage event only reaches the others.
const CHANGED = "saidwho:runs-changed";

const pastRunSchema = z.object({
  id: z.string().refine(isRunId),
  quote: z.string().min(1).max(500),
  language: z.string().max(20).nullable(),
  credit: z.string().max(200).nullable(),
  verdict: verdictSchema.nullable(),
  // Where the earliest trace leads, as the verdict card says it.
  trace: z.string().max(300).nullable(),
  // When the run was saved, as an ISO date.
  at: z.iso.datetime(),
});

export type PastRun = z.infer<typeof pastRunSchema>;

const EMPTY: readonly PastRun[] = [];

// A list that doesn't read as one counts as empty, and an entry that doesn't
// read is dropped, so a stored value from an older page can't break this one.
export function parseHistory(raw: string | null): readonly PastRun[] {
  if (!raw) return EMPTY;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!Array.isArray(value)) return EMPTY;
  const runs = value.flatMap((item) => {
    const parsed = pastRunSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return runs.length ? runs.slice(0, HISTORY_MAX) : EMPTY;
}

// The list with this run first. A run already in it moves to the front with
// what it says now, and the oldest go once there are more than HISTORY_MAX.
export const withRun = (runs: readonly PastRun[], run: PastRun): PastRun[] =>
  [run, ...runs.filter((r) => r.id !== run.id)].slice(0, HISTORY_MAX);

// Storage can be full, off or blocked; then the list just isn't kept.
function read(): string | null {
  try {
    return localStorage.getItem(HISTORY_KEY);
  } catch {
    return null;
  }
}

function write(runs: readonly PastRun[]) {
  try {
    if (runs.length) localStorage.setItem(HISTORY_KEY, JSON.stringify(runs));
    else localStorage.removeItem(HISTORY_KEY);
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

export function rememberRun(run: PastRun) {
  const parsed = pastRunSchema.safeParse(run);
  if (parsed.success) write(withRun(parseHistory(read()), parsed.data));
}

export const forgetRuns = () => write(EMPTY);

// For useSyncExternalStore. The snapshot is parsed again only when the stored
// text changes, so React gets the same list until there is a new one.
let lastRaw: string | null = null;
let lastRuns: readonly PastRun[] = EMPTY;

export function historySnapshot(): readonly PastRun[] {
  const raw = read();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastRuns = parseHistory(raw);
  }
  return lastRuns;
}

// The server has no list, so the page is first drawn without one.
export const serverHistorySnapshot = (): readonly PastRun[] => EMPTY;

export function subscribeHistory(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === HISTORY_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGED, onChange);
  };
}
