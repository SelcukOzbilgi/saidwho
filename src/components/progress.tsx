import { Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { ultraRatio } from "../lib/cost";
import { MODEL_NAME } from "../lib/model-name";
import { plural } from "../lib/plural";
import type { Phase, RunState } from "../lib/run-state";
import { Pop } from "./case-motion";
import { Tick } from "./tick";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "planning", label: "Plan" },
  { phase: "searching", label: "Search" },
  { phase: "reading", label: "Read and check" },
  { phase: "tracing", label: "Follow citations" },
  { phase: "judging", label: "Judge" },
];

type Props = Pick<
  RunState,
  | "phase"
  | "finished"
  | "plan"
  | "searches"
  | "pages"
  | "readUrls"
  | "nodes"
  | "leads"
  | "nebiusUsd"
  | "ultraUsd"
  | "unknownCostCalls"
  | "tavilyCredits"
  | "seconds"
> & { running: boolean; aside?: ReactNode };

type StepState = "done" | "now" | "later";

// How much of the step under way is done, for the steps that can say: the
// planned searches run, and the pages read. null for a step with no count to
// go by, whose bar sweeps instead.
export function stepShare({ phase, plan, searches, pages, readUrls }: Pick<RunState, "phase" | "plan" | "searches" | "pages" | "readUrls">): number | null {
  if (phase === "searching" && plan && plan.queries.length > 0) return Math.min(1, searches / plan.queries.length);
  if (phase === "reading" && pages) return Math.min(1, readUrls.length / pages);
  return null;
}

export function Progress({ running, aside, phase, finished, plan, searches, pages, readUrls, nodes, leads, ...cost }: Props) {
  const at = STEPS.findIndex((step) => step.phase === phase);
  const confirmed = nodes.filter((n) => n.check.status !== "not_found").length;
  const share = stepShare({ phase, plan, searches, pages, readUrls });
  // The Genealogist's pages are read while citations are followed, so the
  // reading count can still climb then; its tick waits until the count is in.
  const readingDone = phase === "judging" || finished || pages === null || readUrls.length >= pages;
  // The counts roll to each new value as the run reports it.
  const detail: Partial<Record<Phase, ReactNode>> = {
    searching: searches ? (
      <>
        <Tick value={searches} /> done
      </>
    ) : undefined,
    reading:
      pages !== null ? (
        <>
          <Tick value={readUrls.length} /> of <Tick value={pages} /> {pages === 1 ? "page" : "pages"}, <Tick value={confirmed} /> confirmed
        </>
      ) : undefined,
    // A run that never traced (or was saved before the Genealogist) says so once it's past this step.
    tracing: leads.length ? (
      <>
        {plural(leads.length, "cited work")}, <Tick value={nodes.filter((n) => n.foundVia).length} />{" "}
        {nodes.filter((n) => n.foundVia).length === 1 ? "page" : "pages"} found
      </>
    ) : phase === "judging" ? (
      "none followed"
    ) : undefined,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* On a phone five columns are too narrow for their words, so each step is a line. */}
      <ol className="flex flex-col gap-1.5 sm:grid sm:grid-cols-5 sm:gap-2" aria-label="Progress">
        {STEPS.map((step, i) => {
          // A run that ended early, stopped or broke leaves its last step unfinished.
          const ended = finished && phase === "judging";
          const state: StepState = i < at || (i === at && ended) ? "done" : i === at && running ? "now" : "later";
          return (
            <li key={step.phase} aria-current={state === "now" ? "step" : undefined} className="flex items-center gap-2 sm:block">
              <StepBar state={state} share={state === "now" ? share : null} />
              <p className={`flex items-center gap-1 text-xs font-medium transition-colors duration-300 sm:mt-1.5 ${state === "later" ? "text-muted" : ""}`}>
                {step.label}
                {state === "done" && (step.phase !== "reading" || readingDone) && (
                  <Pop key="done" className="text-muted">
                    <Check aria-hidden className="size-3" strokeWidth={2.5} />
                  </Pop>
                )}
              </p>
              {detail[step.phase] && <p className="text-[11px] text-muted">{detail[step.phase]}</p>}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1">
          {/* Only once the run is over: while it runs, the Ultra-priced plan alone makes the gap look small. */}
          {finished && <UltraSaving nebiusUsd={cost.nebiusUsd} ultraUsd={cost.ultraUsd} />}
          <Cost {...cost} />
        </div>
        {aside}
      </div>
    </div>
  );
}

// A step's bar. The step under way fills as far as its count has got, or,
// with nothing to count, a short stretch sweeps along it. A finished step is
// full and turns from the marker's orange to ink as the next one starts, so
// the run reads as handing on from step to step.
// The fill growing in proportion is the progress line from shadcnspace's
// Animated Progress Stepper on 21st.dev, here one per step.
function StepBar({ state, share }: { state: StepState; share: number | null }) {
  const sweeps = state === "now" && share === null;
  const fill = state === "done" ? 1 : state === "now" ? (share === null ? 0 : Math.max(0.04, share)) : 0;
  return (
    <div className="relative h-1 w-6 shrink-0 overflow-hidden rounded-full bg-line sm:w-auto">
      <div
        className={`absolute inset-0 origin-left rounded-full transition-[scale,background-color] duration-[450ms] ease-out motion-reduce:transition-none ${state === "done" ? "bg-foreground" : "bg-accent"}`}
        style={{ scale: `${fill} 1` } as CSSProperties}
      />
      {sweeps && <div aria-hidden className="case-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-accent" />}
    </div>
  );
}

// The gap between the run's cost and the same calls at Ultra's prices, said
// once in words, since the figures in the cost line are easy to read past.
export function UltraSaving({ nebiusUsd, ultraUsd }: Pick<RunState, "nebiusUsd" | "ultraUsd">) {
  const ratio = ultraRatio(nebiusUsd, ultraUsd);
  if (ratio === null) return null;
  return (
    <p className="text-sm">
      <strong className="font-semibold text-accent-ink tabular-nums">About {ratio}x cheaper</strong> than the same calls at{" "}
      {MODEL_NAME.ultra} prices
    </p>
  );
}

// Ultra's figure prices the same token counts at Ultra's rates. It is not a
// separate all-Ultra run, which would likely think longer and cost more.
function Cost({
  nebiusUsd,
  ultraUsd,
  unknownCostCalls,
  tavilyCredits,
  seconds,
}: Pick<RunState, "nebiusUsd" | "ultraUsd" | "unknownCostCalls" | "tavilyCredits" | "seconds">) {
  return (
    <p className="font-mono text-xs text-muted tabular-nums">
      {/* Each figure keeps its dollar sign and closing bracket on its own line. */}
      <Tick value={`$${nebiusUsd.toFixed(4)}`} /> on Nebius
      {ultraUsd !== null && ultraUsd > 0 && (
        <>
          {" (same calls at Ultra prices: "}
          <span className="whitespace-nowrap">
            <Tick value={`$${ultraUsd.toFixed(4)}`} />)
          </span>
        </>
      )}
      {" · "}
      <Tick value={tavilyCredits} /> {tavilyCredits === 1 ? "Tavily credit" : "Tavily credits"}
      {unknownCostCalls > 0 && ` · ${plural(unknownCostCalls, "call")} with unknown cost`}
      {seconds !== null && ` · ${seconds}s`}
    </p>
  );
}
