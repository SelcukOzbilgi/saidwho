"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun } from "../lib/run-state";
import { RunView } from "./run-view";

// A replay takes about this long, whatever the run took.
const REPLAY_MS = 12_000;

// A saved run, shown finished. "Watch it run again" plays its events back in
// order, through the same reducer the live page uses.
export function CaseReplay({ events, afterVerdict }: { events: readonly RunEvent[]; afterVerdict?: ReactNode }) {
  const [shown, setShown] = useState(events.length);
  const playing = shown < events.length;
  const run = useMemo(() => events.slice(0, shown).reduce(reduceRun, initialRunState), [events, shown]);

  useEffect(() => {
    if (!playing) return;
    const step = Math.min(400, Math.max(60, REPLAY_MS / events.length));
    const timer = setTimeout(() => setShown((n) => n + 1), step);
    return () => clearTimeout(timer);
  }, [playing, shown, events.length]);

  return (
    <RunView
      run={run}
      running={playing}
      note={
        <p>
          <button
            type="button"
            onClick={() => setShown(playing ? events.length : 1)}
            className="rounded-lg border border-foreground px-4 py-2 text-sm font-medium hover:bg-foreground hover:text-background"
          >
            {playing ? "Skip to the end" : "Watch it run again"}
          </button>
        </p>
      }
      // Kept back until the replay reaches its end, so it doesn't give the answer away.
      afterVerdict={playing ? null : afterVerdict}
    />
  );
}
