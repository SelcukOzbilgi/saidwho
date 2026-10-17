import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { ExampleCase } from "../cases/cases";
import { KNOWN } from "../cases/known";
import { plural } from "../lib/plural";
import { verdictWords } from "../lib/run-state";
import { ArriveList } from "./arrive-list";
import { type KnownMatch, knownMatch, MATCH_LOOK } from "./known-answer";
import { Reveal } from "./reveal";
import { earliestTrace, VERDICT_LOOK } from "./verdict-card";

// Said on each card, so a first look shows which runs got the test set's answer
// and which didn't. The case page gives the known answer itself at the end.
const MATCH_CHIP: Record<KnownMatch, string> = {
  same: "Matches the known answer",
  differs: "Differs from the known answer",
  none: "No verdict to compare",
};

export function CaseGallery({ cases, title = "Finished cases" }: { cases: readonly ExampleCase[]; title?: string }) {
  return (
    <section id="cases" aria-labelledby="cases-title" className="scroll-mt-6">
      <Reveal>
        <h2 id="cases-title" className="reveal-up font-serif text-3xl font-semibold sm:text-4xl">
          {title}
        </h2>
        <p className="reveal-up mt-2 max-w-2xl text-muted">
          Real runs, saved as they happened. Open one to see every step and how it compares to the known answer, or
          watch it run again. No keys needed.
        </p>

        {/* Each card comes in as it is scrolled to, then its verdict is pressed on and,
            a beat later, the chip says whether that verdict is the known one. */}
        <ArriveList className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map(({ caseId, run }) => {
            const output = run.verdict?.output;
            const verdict = output?.verdict;
            const known = KNOWN.get(caseId);
            const match = known && knownMatch(known, verdict ?? null);
            const confirmed = run.nodes.filter((n) => n.check.status !== "not_found").length;
            // The year first, so a narrow card that cuts the line short keeps it.
            const found = output && earliestTrace(output, run.nodes);
            const trace =
              found && output.earliest_author && output.earliest_date
                ? `${output.earliest_date}, ${output.earliest_author}`
                : found?.trace;
            return (
              <li key={caseId} className="cg-card">
                {/* On hover the card lifts a little off the page, the way a card on a desk would. */}
                <Link
                  href={`/cases/${caseId}`}
                  className="cg-link group/card flex h-full flex-col gap-2 rounded-sm border border-line bg-card p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span
                    className={`cg-verdict self-start text-xs font-medium uppercase tracking-wider ${verdict ? VERDICT_LOOK[verdict] : "text-muted"}`}
                  >
                    {verdict ? verdictWords(verdict) : "No verdict"}
                  </span>
                  <span className="line-clamp-3 font-serif text-lg leading-snug">“{run.quote}”</span>
                  <span className="text-sm text-muted">Credited to {run.popularAttribution ?? "no one in particular"}</span>
                  <span className="mt-auto flex flex-col items-start gap-2 pt-2">
                    {match && (
                      <span className={`cg-match rounded-full px-2 py-0.5 text-xs ${MATCH_LOOK[match]}`}>{MATCH_CHIP[match]}</span>
                    )}
                    <span className="flex w-full items-center justify-between gap-2 border-t border-line pt-2 font-mono text-xs text-muted tabular-nums">
                      {/* On hover or focus the run's figures give way to where it traced the
                          saying, a first look at what the case page holds. Both sit in one
                          cell, so the card keeps its height. The case page says it in full,
                          so the preview is left out of the link's name. */}
                      <span className="grid min-w-0">
                        <span className={`col-start-1 row-start-1 truncate ${trace ? "cg-figures" : ""}`}>
                          {plural(confirmed, "source")} · ${run.nebiusUsd.toFixed(4)} · {run.seconds}s
                        </span>
                        {trace && (
                          <span aria-hidden="true" className="cg-trace col-start-1 row-start-1 truncate text-foreground">
                            Earliest trace: {trace}
                          </span>
                        )}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 transition-transform duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-foreground"
                      />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ArriveList>
      </Reveal>
    </section>
  );
}
