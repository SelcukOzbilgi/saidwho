"use client";

import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { plural } from "../lib/plural";
import { forgetRuns, historySnapshot, type PastRun, serverHistorySnapshot, subscribeHistory } from "../lib/run-history";
import { verdictWords } from "../lib/run-state";
import { arriveOnView } from "./arrive-list";
import { Reveal } from "./reveal";
import { VERDICT_LOOK } from "./verdict-card";

// The visitor's own runs, kept in this browser (lib/run-history.ts), as cards
// like the finished cases on the home page, with the same motion: the heading
// eases in and each card rises in as it is scrolled to, its verdict pressed on.
// A run saved while the page is open drops in at the front and the others make
// room, and clearing the list lets it go: the enter, exit and layout motion of
// rmahammad's Animated List on 21st.dev. The list is read only in the browser,
// so the server and the first paint draw nothing here.

const EASE = [0.2, 0, 0, 1] as const;
const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function RunHistory() {
  const runs = useSyncExternalStore(subscribeHistory, historySnapshot, serverHistorySnapshot);
  const still = useReducedMotion() === true;
  const list = useRef<HTMLUListElement>(null);
  const stopArriving = useRef<(() => void) | null>(null);

  // The cards the list opens with come in as they are scrolled to; a run added
  // later comes in through its own motion below.
  useEffect(() => {
    if (stopArriving.current || !runs.length || !list.current) return;
    stopArriving.current = arriveOnView([...list.current.querySelectorAll<HTMLElement>(".cg-card")]);
  }, [runs.length]);
  useEffect(
    () => () => {
      stopArriving.current?.();
      stopArriving.current = null;
    },
    [],
  );

  return (
    <AnimatePresence initial={false}>
      {runs.length > 0 && (
        <motion.section
          key="your-runs"
          aria-labelledby="your-runs-title"
          exit={still ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: still ? 0 : 0.26, ease: EASE }}
        >
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <h2 id="your-runs-title" className="reveal-up font-serif text-3xl font-semibold sm:text-4xl">
                  Your runs
                </h2>
                <p className="reveal-up mt-2 max-w-2xl text-muted">
                  The runs you started here, newest first. Each one has its own page, open to anyone with the link.
                  This list is kept in this browser only.
                </p>
              </div>
              <ClearRuns count={runs.length} />
            </div>

            <ul ref={list} className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence initial={false}>
                {runs.map((run) => (
                  <motion.li
                    key={run.id}
                    layout={still ? false : "position"}
                    initial={still ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={still ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: still ? 0 : 0.26, ease: EASE }}
                  >
                    <RunCard run={run} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Reveal>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function RunCard({ run }: { run: PastRun }) {
  return (
    // cg-card and cg-link: the case cards' arrival and hover, from globals.css.
    <div className="cg-card h-full">
      <Link
        href={`/runs/${run.id}`}
        className="cg-link group/card flex h-full flex-col gap-2 rounded-sm border border-line bg-card p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <span
          className={`cg-verdict self-start text-xs font-medium uppercase tracking-wider ${run.verdict ? VERDICT_LOOK[run.verdict] : "text-muted"}`}
        >
          {run.verdict ? verdictWords(run.verdict) : "No verdict"}
        </span>
        <span lang={run.language ?? undefined} dir="auto" className="line-clamp-3 font-serif text-lg leading-snug">
          “{run.quote}”
        </span>
        <span className="text-sm text-muted">Credited to {run.credit ?? "no one in particular"}</span>
        {/* On hover or focus the date gives way to where the run traced the
            saying, as on the case cards. The run's page says it in full, so the
            preview is left out of the link's name. */}
        <span className="mt-auto flex w-full items-center justify-between gap-2 border-t border-line pt-2 font-mono text-xs text-muted tabular-nums">
          <span className="grid min-w-0">
            <time dateTime={run.at} className={`col-start-1 row-start-1 truncate ${run.trace ? "cg-figures" : ""}`}>
              {WHEN.format(new Date(run.at))}
            </time>
            {run.trace && (
              <span aria-hidden="true" className="cg-trace col-start-1 row-start-1 truncate text-foreground">
                Earliest trace: {run.trace}
              </span>
            )}
          </span>
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-foreground"
          />
        </span>
      </Link>
    </div>
  );
}

// Clearing asks once, in place, since the list can't be brought back. The runs'
// pages stay up either way.
function ClearRuns({ count }: { count: number }) {
  const [asking, setAsking] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);
  const clear = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (asking) keep.current?.focus();
    else if (opened.current) clear.current?.focus();
    opened.current = asking;
  }, [asking]);

  const BUTTON =
    "rounded-sm border px-3 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink";
  if (!asking) {
    return (
      <button ref={clear} type="button" onClick={() => setAsking(true)} className={`${BUTTON} border-line text-muted hover:border-foreground hover:text-foreground`}>
        Clear this list
      </button>
    );
  }
  return (
    <div role="group" aria-label="Clear this list" className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Take {plural(count, "run")} off this list? Their pages stay up.</span>
      <button type="button" onClick={forgetRuns} className={`${BUTTON} border-foreground bg-foreground text-background hover:bg-accent hover:text-on-accent`}>
        Clear
      </button>
      <button ref={keep} type="button" onClick={() => setAsking(false)} className={`${BUTTON} border-line hover:border-foreground`}>
        Keep
      </button>
    </div>
  );
}
