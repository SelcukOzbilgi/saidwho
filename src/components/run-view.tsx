import type { ReactNode } from "react";

import type { Phase, RunState } from "../lib/run-state";
import { Arrivals, Enter } from "./case-motion";
import { Lineage } from "./lineage";
import { Progress } from "./progress";
import { RunLog } from "./run-log";
import { RunSoFar } from "./run-so-far";
import { Timeline } from "./timeline";
import { VerdictCard } from "./verdict-card";

type Props = {
  run: RunState;
  running: boolean;
  // A case page has no other heading, so there the quote is the page's h1.
  quoteIsHeading?: boolean;
  // Read new log lines aloud; on for a live run, off for a replay.
  announce?: boolean;
  // Shown beside the cost line, under the progress bar.
  note?: ReactNode;
  // Shown under the verdict.
  afterVerdict?: ReactNode;
  // Why a live run ended without an answer: the card goes in the verdict's
  // place, and the progress bar marks where it broke off.
  problem?: { card: ReactNode; tone: "bad" | "warn"; at: Phase };
};

// A run as the page shows it, whether it is happening now or replayed from a saved log.
export function RunView({ run, running, quoteIsHeading = false, announce = false, note, afterVerdict, problem }: Props) {
  const verdict = run.verdict?.output;
  const Quote = quoteIsHeading ? "h1" : "blockquote";

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Quote lang={run.language ?? undefined} dir="auto" className="font-serif text-2xl leading-snug italic sm:text-3xl">
          “{run.quote}”
        </Quote>
        <p className="mt-2 text-muted">
          <CreditLine run={run} running={running} />
        </p>
      </header>

      <Progress running={running} {...run} aside={note} brokeAt={problem && { phase: problem.at, tone: problem.tone }} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {/* Until there is a verdict, a run under way says where it is instead. Once it
              ends without one, the card says why; the plan, which only showed
              progress, goes with the card, and the log keeps it. */}
          {/* The verdict replaces the run so far in one move; on a finished page it is just there. */}
          <Arrivals>
            {running && !run.verdict ? (
              <Enter key="so-far">
                <RunSoFar {...run} announce={announce} />
              </Enter>
            ) : problem && !run.verdict ? (
              <Enter key="problem" rise={12}>
                {problem.card}
              </Enter>
            ) : (
              <Enter key="verdict" rise={12}>
                <VerdictCard {...run} />
              </Enter>
            )}
            {/* After the verdict's stamp has landed. */}
            {afterVerdict && (
              <Enter key="after" delay={0.45}>
                {afterVerdict}
              </Enter>
            )}
          </Arrivals>
        </div>
        <RunLog log={run.log} announce={announce} />
      </div>

      {/* The lineage and the timeline get the page's full width, so their cards don't hide off to the side. */}
      <Arrivals>{verdict?.lineage && <Lineage key="lineage" steps={verdict.lineage} nodes={run.nodes} />}</Arrivals>
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
