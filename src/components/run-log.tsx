"use client";

import { useEffect, useRef } from "react";

import { atBottom, jumpToEnd } from "../lib/log-follow";
import type { Agent, LogEntry, Tone } from "../lib/run-state";
import { TierChip } from "./tier-chip";

const DOT: Record<Tone, string> = {
  neutral: "bg-line",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
};

// What each name in the log does, in the order a run reaches them. The model each
// call ran on is shown on its line, so it isn't repeated here.
export const AGENT_ROLE: Record<Agent, string> = {
  Run: "The run itself: when it started, which sites it left out, and when it stopped.",
  Planner: "Writes the search: other wordings of the quote, who might have said it, and the queries.",
  Search: "Web search through Tavily, which brings back the pages to read.",
  Reader: "Reads one page and copies the quote word for word, with who the page credits, its date and any older work it names.",
  Checker: "Plain code, no model. Checks every copied line against the page text and crosses out what isn't there. It also corrects a verdict's earliest date or page when the pages don't back it.",
  Genealogist: "Picks older works the confirmed pages name and looks for them in digital libraries, for up to two rounds.",
  Judge: "Weighs only the confirmed pages and gives the verdict, which code checks before it stands.",
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
      <div className="relative border-b border-line">
        <h2 className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted">What the agents did</h2>
        {/* The toggle sits on the heading's line; the list opens under it. */}
        <details className="group">
          <summary className="absolute top-1 right-2 flex min-h-7 cursor-pointer list-none items-center rounded px-2 text-xs text-muted underline decoration-line underline-offset-2 hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Who does what</span>
            <span className="hidden group-open:inline">Hide</span>
          </summary>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 px-4 pb-3 text-xs">
            {Object.entries(AGENT_ROLE).map(([agent, role]) => (
              <div key={agent} className="contents">
                <dt className="font-medium">{agent}</dt>
                <dd className="text-foreground/85">{role}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
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
