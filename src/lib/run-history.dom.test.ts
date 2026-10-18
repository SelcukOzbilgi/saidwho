// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetRuns,
  HISTORY_KEY,
  HISTORY_MAX,
  historySnapshot,
  type PastRun,
  parseHistory,
  rememberRun,
  subscribeHistory,
  withRun,
} from "./run-history";

const run = (n: number, extra: Partial<PastRun> = {}): PastRun => ({
  id: `run-id-${String(n).padStart(4, "0")}`,
  quote: `Quote number ${n}`,
  language: "en",
  credit: "Someone",
  verdict: "misattributed",
  trace: "1903, The Open Court",
  at: new Date(Date.UTC(2026, 9, 18, 10, n)).toISOString(),
  ...extra,
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("run history", () => {
  it("puts a new run first, moves a run seen again to the front, and keeps the newest", () => {
    expect(withRun([run(1), run(2)], run(3)).map((r) => r.id)).toEqual([run(3).id, run(1).id, run(2).id]);
    expect(withRun([run(1), run(2)], run(2, { quote: "Now" }))).toEqual([run(2, { quote: "Now" }), run(1)]);
    const full = Array.from({ length: HISTORY_MAX }, (_, i) => run(i));
    const next = withRun(full, run(99));
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0].id).toBe(run(99).id);
    expect(next.at(-1)!.id).toBe(run(HISTORY_MAX - 2).id);
  });

  it("reads a broken or foreign stored value as an empty list, and drops entries it can't read", () => {
    for (const raw of [null, "", "{", "{}", '"text"', "42"]) expect(parseHistory(raw)).toEqual([]);
    const stored = JSON.stringify([run(1), { ...run(2), id: "../../admin" }, { ...run(3), verdict: "maybe" }, "x", run(4)]);
    expect(parseHistory(stored).map((r) => r.id)).toEqual([run(1).id, run(4).id]);
  });

  it("keeps runs in this browser and tells this tab when they change", () => {
    const changed = vi.fn();
    const stop = subscribeHistory(changed);
    rememberRun(run(1));
    rememberRun(run(2));
    expect(historySnapshot().map((r) => r.id)).toEqual([run(2).id, run(1).id]);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)!)).toHaveLength(2);
    forgetRuns();
    expect(historySnapshot()).toEqual([]);
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    rememberRun(run(3));
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("hands React the same list until the stored text changes", () => {
    rememberRun(run(1));
    const first = historySnapshot();
    expect(historySnapshot()).toBe(first);
    rememberRun(run(2));
    expect(historySnapshot()).not.toBe(first);
  });

  it("refuses an entry that doesn't read, and carries on when storage is blocked", () => {
    rememberRun({ ...run(1), id: "not an id" });
    expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => rememberRun(run(2))).not.toThrow();
    expect(historySnapshot()).toEqual([]);
  });
});
