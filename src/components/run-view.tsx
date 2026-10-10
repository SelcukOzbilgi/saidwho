import type { ReactNode } from "react";

import type { RunState } from "../lib/run-state";
import { Progress } from "./progress";
import { RunLog } from "./run-log";
import { Timeline } from "./timeline";
import { VerdictCard } from "./verdict-card";

type Props = {
  run: RunState;
  running: boolean;
  // Shown under the progress bar.
  note?: ReactNode;
  // Shown under the verdict.
  afterVerdict?: ReactNode;
};

// A run as the page shows it, whether it is happening now or replayed from a saved log.
export function RunView({ run, running, note, afterVerdict }: Props) {
  const verdict = run.verdict?.output;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <blockquote className="font-serif text-2xl leading-snug italic sm:text-3xl">“{run.quote}”</blockquote>
        <p className="mt-2 text-muted">
          <CreditLine run={run} running={running} />
        </p>
      </header>

      <Progress running={running} {...run} />
      {note}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <VerdictCard {...run} />
          {afterVerdict}
          <Timeline
            nodes={run.nodes}
            marks={{
              earliest: verdict?.earliest_node ?? null,
              // Judges sometimes fill this in for other verdicts too; it only means something here.
              misattribution: verdict?.verdict === "misattributed" ? verdict.misattribution_node : null,
            }}
          />
          {run.nodes.length === 0 && running && (
            <p className="text-sm text-muted">Pages that carry the quote will show up here as they are checked.</p>
          )}
        </div>
        <RunLog log={run.log} />
      </div>
    </div>
  );
}

// A name from the planner is what the model believes people say, not something
// a page backed up, so the line says where the name came from.
function CreditLine({ run, running }: Pick<Props, "run" | "running">) {
  const name = <span className="text-foreground">{run.popularAttribution}</span>;
  if (run.attributionFrom === "visitor") return <>Usually credited to {name}</>;
  if (run.attributionFrom === "planner") return <>No name was given. The planner says it&apos;s usually credited to {name}.</>;
  if (running && run.phase === "planning") return <>No name was given, so the planner will say who it&apos;s usually credited to.</>;
  return <>No name was given, and the planner didn&apos;t name anyone.</>;
}
