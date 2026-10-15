import Link from "next/link";
import type { ReactNode } from "react";

import { CASCADE, type Tier } from "../agent/models";
import { LEADS_PER_ROUND, MAX_PAGES, MAX_QUERIES, TRACE_ROUNDS } from "../agent/orchestrator";
import type { CheckerRejections } from "../cases/checker-rejections";
import { MODEL_NAME } from "../lib/model-name";
import { plural } from "../lib/plural";
import { TierChip } from "./tier-chip";

// The six steps of a run, for the home page. Which model each step uses comes
// from the cascade in models.ts, and the limits from the orchestrator, so this
// can't drift from what a run does.

type Step = {
  name: string;
  does: string;
  // The model the step runs on, and the one it moves to when a check fails.
  model?: { first: Tier; retry?: Tier };
  tool?: string;
};

export const STEPS: readonly Step[] = [
  {
    name: "Planner",
    does: "Thinks of other ways the quote has been worded or translated, who might have said it, and what to search for.",
    model: { first: CASCADE.plan.tier },
  },
  {
    name: "Search",
    does:
      `Up to ${MAX_QUERIES} web searches, starting with the exact quote. Each one comes back with the pages' full text, not a summary. ` +
      "Quote Investigator, Wikiquote and Wikipedia are left out, so the trail has to be found from scratch.",
    tool: "Tavily search",
  },
  {
    name: "Readers",
    does: `Go through up to ${MAX_PAGES} pages and copy the sentence that carries the quote, who it's credited to, the date, and any older source the page names.`,
    model: { first: CASCADE.read.tier, retry: CASCADE.reread.tier },
  },
  {
    name: "Checker",
    does:
      "Looks for each copied sentence in the page's own text, and checks it is the saying and not some other line. " +
      "It's plain code, not AI, so it can't be talked into a sentence the page doesn't have.",
    tool: "Plain code",
  },
  {
    name: "Genealogist",
    does:
      `Picks up to ${LEADS_PER_ROUND} older works the confirmed pages cite and looks for each one in digital libraries like archive.org and Wikisource. ` +
      `What turns up goes through the Readers and Checker again, up to ${TRACE_ROUNDS} rounds back.`,
    model: { first: CASCADE.trace.tier },
    tool: "Tavily search, libraries only",
  },
  {
    name: "Judge",
    does:
      "Writes the verdict from the confirmed pages only. Code checks every page it cites, and a verdict that cites one the Checker didn't confirm is set aside and written again.",
    model: { first: CASCADE.judge.tier, retry: CASCADE.rejudge.tier },
  },
];

// Looks like the smallest model's chip, so the tools sit quietly next to the models.
function ToolChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line px-1.5 py-px font-mono text-[10px] tracking-wide text-muted">
      {children}
    </span>
  );
}

export function HowItWorks({ rejections, cases }: { rejections: CheckerRejections; cases: number }) {
  const { rejected, rescued, crossedOut, example } = rejections;

  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-6">
      <h2 id="how-title" className="font-serif text-3xl font-semibold">
        How it works
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        Six steps, each with one job. The models are NVIDIA Nemotron, served by Nebius Token Factory, and the search is
        Tavily. {MODEL_NAME[CASCADE.read.tier]} reads every page; a bigger model reads a page again, or writes the
        verdict again, only when a call or a check fails.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <li
            key={step.name}
            className={`flex flex-col gap-2 rounded-xl border bg-card p-4 ${step.name === "Checker" ? "border-bad/40" : "border-line"}`}
          >
            <h3 className="flex items-baseline gap-2">
              <span className="font-mono text-xs text-muted tabular-nums">{i + 1}</span>
              <span className="font-medium">{step.name}</span>
              {step.name === "Checker" && (
                <span aria-hidden className="text-bad">
                  ✗
                </span>
              )}
            </h3>
            <p className="text-sm leading-relaxed text-foreground/85">{step.does}</p>
            <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted">
              {step.model && <TierChip tier={step.model.first} />}
              {step.model?.retry && (
                <>
                  then <TierChip tier={step.model.retry} /> on a retry
                </>
              )}
              {step.tool && <ToolChip>{step.tool}</ToolChip>}
            </p>
            {step.name === "Checker" && rejected > 0 && (
              <p className="border-t border-line pt-2 text-sm">
                In the {cases} saved cases it turned down {plural(rejected, "snippet")}.{" "}
                {rescued > 0 && `${rescued} passed when ${MODEL_NAME[CASCADE.reread.tier]} read the page again`}
                {rescued > 0 && crossedOut > 0 && ", and "}
                {crossedOut > 0 && `${crossedOut} ${crossedOut === 1 ? "stays" : "stay"} crossed out`}
                {example ? (
                  <>
                    ,{" "}
                    <Link
                      href={`/cases/${example.caseId}#node-${example.nodeId}`}
                      className="underline decoration-bad underline-offset-4 hover:text-bad"
                    >
                      like this one
                    </Link>
                    .
                  </>
                ) : (
                  "."
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
