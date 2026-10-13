"use client";

import { useEffect, useRef } from "react";

import { atBottom, jumpToEnd } from "../lib/log-follow";
import type { LogEntry, Tone } from "../lib/run-state";
import { TierChip } from "./tier-chip";

const DOT: Record<Tone, string> = {
  neutral: "bg-line",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
};

// What each agent did, in order, with the model it ran on and what the call cost.
// The box opens on its newest line, so a finished run shows how it ended, and
// follows new lines while the reader stays at the bottom. announce reads new
// lines aloud, which only a live run needs.
export function RunLog({ log, announce }: { log: readonly LogEntry[]; announce: boolean }) {
  const list = useRef<HTMLOListElement>(null);
  // Whether the reader is at the bottom, as of their last scroll.
  const following = useRef(true);
  const shown = useRef(0);

  // Scroll inside the box only, never the page.
  useEffect(() => {
    const box = list.current;
    if (box && jumpToEnd({ shown: shown.current, length: log.length, following: following.current })) {
      box.scrollTop = box.scrollHeight;
      following.current = true;
    }
    shown.current = log.length;
  }, [log.length]);

  return (
    <section aria-label="Run log" className="self-start rounded-xl border border-line bg-card">
      <h2 className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        What the agents did
      </h2>
      <ol
        ref={list}
        onScroll={(event) => {
          following.current = atBottom(event.currentTarget);
        }}
        className="max-h-[28rem] overflow-y-auto px-4 py-2 text-sm"
        aria-live={announce ? "polite" : "off"}
      >
        {log.map((entry) => (
          <li key={entry.id} className="arrive flex items-start gap-2 py-1.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[entry.tone]}`} aria-hidden />
            <span className="w-24 shrink-0 font-medium">{entry.agent}</span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-foreground/85">{entry.text}</p>
              {/* The model's full name doesn't fit beside the text, so it and the cost go under it. */}
              {(entry.tier || entry.costUsd !== null) && (
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  {entry.tier && <TierChip tier={entry.tier} />}
                  {entry.costUsd !== null && <span className="font-mono text-xs text-muted">{callCost(entry.costUsd)}</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// A Lightning call can cost less than the four places shown; "$0.0000" would read as free.
export const callCost = (usd: number): string => (usd > 0 && usd < 0.00005 ? "<$0.0001" : `$${usd.toFixed(4)}`);
