import type { CSSProperties, ReactNode } from "react";

import type { Tier } from "../agent/models";
import { PlayAgain, PlayOnView } from "./play-on-view";
import { RunMapSpy } from "./run-map-spy";
import { TierChip } from "./tier-chip";
import { TraceLoop } from "./trace-loop";

// The six steps of a run on one card, played in order the first time it comes
// into view: each step lights up as the run reaches it and the line down to the
// next one fills, the Checker throws a snippet out, and the Genealogist's loop
// sends the run back through the Readers and the Checker once for each round.
// Each step links to its part of the list next to it, and on a wide screen the
// step being read there is marked. Rendered as a run ends, so it reads the same
// without JavaScript.
//
// Adapted from n1m4mz's Agent Trace on 21st.dev: one timeline sets each row's
// state (waiting, running, done), the finished run is the resting state, and
// under reduced motion it stays there. Its spans and durations aren't taken
// over: a saved run doesn't keep when each step ran, so the pace here is the
// diagram's own, not a run's.

export type MapStep = {
  name: string;
  model?: { first: Tier; retry?: Tier };
  tool?: string;
};

// Looks like the smallest model's chip, so the tools sit quietly next to the models.
export function ToolChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line px-1.5 py-px font-mono text-[10px] tracking-wide text-muted">
      {children}
    </span>
  );
}

export const stepAnchor = (name: string) => `how-${name.toLowerCase()}`;

// How long each part of the play takes, in ms. A step runs for STEP; the
// Checker takes longer, since it throws a snippet out on the way; one round of
// the loop takes ROUND.
const START = 250;
const STEP = 420;
const CHECK = 1100;
const GAP = 140;
const ROUND = 1200;

type Timing = { start: number; done: number };

// When each step starts and is done, and when the loop starts going round.
export function playTimes(steps: readonly MapStep[], rounds: number) {
  const times: Timing[] = [];
  let loopAt = 0;
  let t = START;
  for (const step of steps) {
    const done = t + (step.name === "Checker" ? CHECK : STEP);
    times.push({ start: t, done });
    t = done + GAP;
    if (step.name === "Genealogist") {
      loopAt = done + 450;
      t = loopAt + rounds * ROUND + GAP;
    }
  }
  return { times, loopAt, end: t };
}

const ms = (n: number) => `${n}ms`;

export function RunMap({
  steps,
  rounds,
  roundsLabel,
  thrownOut,
}: {
  steps: readonly MapStep[];
  rounds: number;
  roundsLabel: string;
  // The start of a snippet the Checker turned down in a saved case, or null.
  thrownOut: string | null;
}) {
  const { times, loopAt } = playTimes(steps, rounds);

  return (
    <PlayOnView
      className="hiw-map rounded-sm border border-line bg-card p-4 shadow-sm sm:p-5"
      style={{ "--loop-at": ms(loopAt), "--round": ms(ROUND), "--rounds": rounds } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>One run, step by step</span>
        <PlayAgain />
        <RunMapSpy />
      </div>

      {/* The loop is measured from the two nodes, so it sits in the same box as the list. */}
      <div className="relative mt-3">
        <TraceLoop from="Genealogist" to="Readers" rounds={rounds} />
        <ol className="flex flex-col pl-5">
          {steps.map((step, i) => {
            const { start, done } = times[i];
            const look = { "--start": ms(start), "--done": ms(done), "--busy": ms(done - start) } as CSSProperties;
            const checker = step.name === "Checker";
            const again = step.name === "Readers" || checker;
            return (
              <li key={step.name} className="relative" style={look}>
                {/* The line down to the next step, which fills once this one is done. */}
                {i < steps.length - 1 && (
                  <span aria-hidden="true" className="absolute top-10 -bottom-1 left-[calc(0.5rem+0.875rem-0.5px)] w-px bg-line">
                    <span className="hiw-fill absolute inset-0 bg-foreground/45" />
                  </span>
                )}
                <a
                  href={`#${stepAnchor(step.name)}`}
                  className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2 py-2 hover:bg-foreground/5 aria-[current=step]:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                >
                  <span
                    aria-hidden="true"
                    data-step-node={step.name}
                    className="relative flex size-7 items-center justify-center rounded-full border border-line bg-card font-mono text-[11px] text-muted tabular-nums"
                  >
                    {i + 1}
                    {/* Done: the node inks in. Running: a ring in the marker orange. */}
                    <span className="hiw-done absolute -inset-px flex items-center justify-center rounded-full border border-foreground bg-card text-foreground">
                      {i + 1}
                    </span>
                    <span className="hiw-busy absolute -inset-1 rounded-full border-2 border-accent" />
                    {again && <span className={`hiw-again absolute -inset-1 rounded-full border-2 border-accent ${checker ? "hiw-again-late" : ""}`} />}
                  </span>
                  <span className="hiw-name min-w-0 truncate text-sm font-medium">{step.name}</span>
                  <span className="flex justify-end">
                    {step.model ? <TierChip tier={step.model.first} /> : step.tool && <ToolChip>{step.tool}</ToolChip>}
                  </span>
                </a>
                {checker && thrownOut && (
                  <p className="hiw-thrown mb-1 ml-[3.25rem] flex min-w-0 items-baseline gap-2 text-xs">
                    <s className="strike min-w-0 truncate font-serif text-[13px] text-foreground/70 no-underline">“{thrownOut}”</s>
                    <span className="shrink-0 text-bad">thrown out</span>
                  </p>
                )}
                {step.name === "Genealogist" && (
                  <p className="hiw-rounds mb-1 ml-[3.25rem] text-xs text-accent-ink">{roundsLabel}</p>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </PlayOnView>
  );
}
