import type { ReactNode } from "react";

import { ultraRatio } from "../lib/cost";
import { MODEL_NAME } from "../lib/model-name";
import { plural } from "../lib/plural";
import type { Phase, RunState } from "../lib/run-state";

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

export function Progress({ running, aside, phase, finished, searches, pages, readUrls, nodes, leads, ...cost }: Props) {
  const at = STEPS.findIndex((step) => step.phase === phase);
  const confirmed = nodes.filter((n) => n.check.status !== "not_found").length;
  const detail: Partial<Record<Phase, string>> = {
    searching: searches ? `${searches} done` : undefined,
    reading: pages !== null ? `${readUrls.length} of ${plural(pages, "page")}, ${confirmed} confirmed` : undefined,
    // A run that never traced (or was saved before the Genealogist) says so once it's past this step.
    tracing: leads.length
      ? `${plural(leads.length, "cited work")}, ${plural(nodes.filter((n) => n.foundVia).length, "page")} found`
      : phase === "judging"
        ? "none followed"
        : undefined,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* On a phone five columns are too narrow for their words, so each step is a line. */}
      <ol className="flex flex-col gap-1.5 sm:grid sm:grid-cols-5 sm:gap-2" aria-label="Progress">
        {STEPS.map((step, i) => {
          // A run that ended early, stopped or broke leaves its last step unfinished.
          const ended = finished && phase === "judging";
          const state = i < at || (i === at && ended) ? "done" : i === at && running ? "now" : "later";
          return (
            <li key={step.phase} aria-current={state === "now" ? "step" : undefined} className="flex items-center gap-2 sm:block">
              <div
                className={`h-1 w-6 shrink-0 rounded-full sm:w-auto ${state === "done" ? "bg-foreground" : state === "now" ? "motion-safe:animate-pulse bg-accent" : "bg-line"}`}
              />
              <p className={`text-xs font-medium sm:mt-1.5 ${state === "later" ? "text-muted" : ""}`}>{step.label}</p>
              {detail[step.phase] && <p className="text-[11px] text-muted tabular-nums">{detail[step.phase]}</p>}
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
      ${nebiusUsd.toFixed(4)} on Nebius
      {ultraUsd !== null && ultraUsd > 0 && ` (same calls at Ultra prices: $${ultraUsd.toFixed(4)})`}
      {` · ${plural(tavilyCredits, "Tavily credit")}`}
      {unknownCostCalls > 0 && ` · ${plural(unknownCostCalls, "call")} with unknown cost`}
      {seconds !== null && ` · ${seconds}s`}
    </p>
  );
}
