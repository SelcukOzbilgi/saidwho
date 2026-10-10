import type { Phase, RunState } from "../lib/run-state";

const STEPS: { phase: Phase; label: string }[] = [
  { phase: "planning", label: "Plan" },
  { phase: "searching", label: "Search" },
  { phase: "reading", label: "Read and check" },
  { phase: "judging", label: "Judge" },
];

type Props = Pick<
  RunState,
  "phase" | "finished" | "searches" | "pages" | "readUrls" | "nodes" | "nebiusUsd" | "ultraUsd" | "unknownCostCalls" | "tavilyCredits" | "seconds"
> & { running: boolean };

export function Progress({ running, phase, finished, searches, pages, readUrls, nodes, ...cost }: Props) {
  const at = STEPS.findIndex((step) => step.phase === phase);
  const confirmed = nodes.filter((n) => n.check.status !== "not_found").length;
  const detail: Partial<Record<Phase, string>> = {
    searching: searches ? `${searches} done` : undefined,
    reading: pages !== null ? `${readUrls.length} of ${pages} pages, ${confirmed} confirmed` : undefined,
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((step, i) => {
          // A run that ended early, stopped or broke leaves its last step unfinished.
          const ended = finished && phase === "judging";
          const state = i < at || (i === at && ended) ? "done" : i === at && running ? "now" : "later";
          return (
            <li key={step.phase} aria-current={state === "now" ? "step" : undefined}>
              <div
                className={`h-1 rounded-full ${state === "done" ? "bg-foreground" : state === "now" ? "motion-safe:animate-pulse bg-accent" : "bg-line"}`}
              />
              <p className={`mt-1.5 text-xs font-medium ${state === "later" ? "text-muted" : ""}`}>{step.label}</p>
              {detail[step.phase] && <p className="text-[11px] text-muted tabular-nums">{detail[step.phase]}</p>}
            </li>
          );
        })}
      </ol>
      <Cost {...cost} />
    </div>
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
      {` · ${tavilyCredits} Tavily credit${tavilyCredits === 1 ? "" : "s"}`}
      {unknownCostCalls > 0 && ` · ${unknownCostCalls} call${unknownCostCalls === 1 ? "" : "s"} with unknown cost`}
      {seconds !== null && ` · ${seconds}s`}
    </p>
  );
}
