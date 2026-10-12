"use client";

import { useEffect, useRef } from "react";

import type { LogEntry, Tone } from "../lib/run-state";
import { TierChip } from "./tier-chip";

const DOT: Record<Tone, string> = {
  neutral: "bg-line",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
};

// What each agent did, in order, with the model it ran on and what the call cost.
// follow keeps the newest line in view while a run plays; a finished run opens at
// its first line. announce reads new lines aloud, which only a live run needs.
export function RunLog({ log, follow, announce }: { log: readonly LogEntry[]; follow: boolean; announce: boolean }) {
  const list = useRef<HTMLOListElement>(null);

  // Follow new lines inside the box, without scrolling the page.
  useEffect(() => {
    if (follow && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [follow, log.length]);

  return (
    <section aria-label="Run log" className="self-start rounded-xl border border-line bg-card">
      <h2 className="border-b border-line px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">
        What the agents did
      </h2>
      <ol ref={list} className="max-h-[28rem] overflow-y-auto px-4 py-2 text-sm" aria-live={announce ? "polite" : "off"}>
        {log.map((entry) => (
          <li key={entry.id} className="arrive flex items-start gap-2 py-1.5">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[entry.tone]}`} aria-hidden />
            <span className="w-16 shrink-0 font-medium">{entry.agent}</span>
            <span className="min-w-0 flex-1 break-words text-foreground/85">{entry.text}</span>
            {entry.tier && <TierChip tier={entry.tier} />}
            {entry.costUsd !== null && (
              <span className="w-14 shrink-0 text-right font-mono text-xs text-muted">${entry.costUsd.toFixed(4)}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
