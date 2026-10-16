"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun } from "../lib/run-state";
import { Arrivals, Enter } from "./case-motion";
import { RunView } from "./run-view";

// A replay takes about this long, whatever the run took.
const REPLAY_MS = 12_000;

// How long each event waits for the next, so a long log doesn't drag and a short one doesn't rush.
export const replayStep = (events: number): number => Math.min(400, Math.max(60, REPLAY_MS / events));

// Where a point on the replay bar lands: at least the first event, so the quote
// always shows, and at most all of them.
export const shownAt = (ratio: number, events: number): number =>
  Math.min(events, Math.max(1, Math.round(ratio * events)));

// A saved run, shown finished. "Watch it run again" plays its events back in
// order, through the same reducer the live page uses. While it plays, it can be
// paused, dragged along its bar or skipped to the end.
export function CaseReplay({ events, afterVerdict }: { events: readonly RunEvent[]; afterVerdict?: ReactNode }) {
  const [shown, setShown] = useState(events.length);
  const [paused, setPaused] = useState(false);
  const replaying = shown < events.length;
  const run = useMemo(() => events.slice(0, shown).reduce(reduceRun, initialRunState), [events, shown]);

  useEffect(() => {
    if (!replaying || paused) return;
    const timer = setTimeout(() => setShown((n) => n + 1), replayStep(events.length));
    return () => clearTimeout(timer);
  }, [replaying, paused, shown, events.length]);

  return (
    <RunView
      run={run}
      running={replaying}
      quoteIsHeading
      note={
        <ReplayControl
          shown={shown}
          total={events.length}
          paused={paused}
          onStart={() => {
            setPaused(false);
            setShown(1);
          }}
          onPause={setPaused}
          onSeek={setShown}
        />
      }
      // Kept back until the replay reaches its end, so it doesn't give the answer away.
      afterVerdict={replaying ? null : afterVerdict}
    />
  );
}

type ControlProps = {
  shown: number;
  total: number;
  paused: boolean;
  onStart: () => void;
  onPause: (paused: boolean) => void;
  onSeek: (shown: number) => void;
};

// The replay's controls. One button stays put throughout, starting the replay and
// then pausing it, so keyboard focus isn't lost when the replay starts or ends.
// The bar beside it shows how far the replay has got, and moves it when dragged;
// a drag holds the replay still and lets it carry on from the new place.
function ReplayControl({ shown, total, paused, onStart, onPause, onSeek }: ControlProps) {
  const replaying = shown < total;
  const main = useRef<HTMLButtonElement>(null);
  // Whether the replay was playing when a drag on the bar began, so it carries on after.
  const resume = useRef(false);

  const seek = (n: number) => onSeek(Math.min(total, Math.max(1, n)));
  const seekTo = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width > 0) seek(shownAt((event.clientX - box.left) / box.width, total));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const tenth = Math.max(1, Math.round(total / 10));
    const to: Record<string, number> = {
      ArrowRight: shown + 1,
      ArrowUp: shown + 1,
      ArrowLeft: shown - 1,
      ArrowDown: shown - 1,
      PageUp: shown + tenth,
      PageDown: shown - tenth,
      Home: 1,
      End: total,
    };
    if (!(event.key in to)) return;
    event.preventDefault();
    seek(to[event.key]);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        ref={main}
        type="button"
        onClick={() => (replaying ? onPause(!paused) : onStart())}
        aria-label={replaying ? (paused ? "Play the replay" : "Pause the replay") : undefined}
        className={
          replaying
            ? "flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:bg-accent hover:text-on-accent"
            : "flex items-center gap-2 rounded-sm border border-foreground px-4 py-2 text-sm font-medium hover:bg-foreground hover:text-background"
        }
      >
        {!replaying ? (
          <>
            <RotateCcw aria-hidden className="size-3.5" strokeWidth={2.25} />
            Watch it run again
          </>
        ) : paused ? (
          <Play aria-hidden className="size-3.5 translate-x-px fill-current" />
        ) : (
          <Pause aria-hidden className="size-3.5 fill-current" />
        )}
      </button>

      <Arrivals>
        {replaying && (
          <Enter key="bar" rise={0} className="flex items-center gap-3">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Replay position"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={shown}
              aria-valuetext={`Event ${shown} of ${total}`}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                // Held still while dragging, so the replay doesn't pull away from the pointer.
                resume.current = !paused;
                onPause(true);
                seekTo(event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) seekTo(event);
              }}
              onPointerUp={() => {
                if (resume.current) onPause(false);
                resume.current = false;
              }}
              onPointerCancel={() => {
                if (resume.current) onPause(false);
                resume.current = false;
              }}
              onKeyDown={onKey}
              className="relative flex h-9 w-28 cursor-ew-resize touch-none items-center rounded-sm select-none sm:w-44"
            >
              <div className="h-1 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full w-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${shown / total})` }}
                />
              </div>
              {/* The handle rides on a full-width layer moved by transform, so it glides with the fill. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 transition-transform duration-300 ease-out motion-reduce:transition-none"
                style={{ transform: `translateX(${(shown / total) * 100}%)` }}
              >
                <span className="absolute top-1/2 left-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-accent" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onSeek(total);
                // The bar and this button go once the replay ends; keep focus on the one that stays.
                main.current?.focus();
              }}
              className="py-2 text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-foreground"
            >
              Skip to the end
            </button>
          </Enter>
        )}
      </Arrivals>
    </div>
  );
}
