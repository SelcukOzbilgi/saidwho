import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ExampleCase } from "../cases/cases";
import { KNOWN } from "../cases/known";
import { plural } from "../lib/plural";
import { verdictWords } from "../lib/run-state";
import { type KnownMatch, knownMatch, MATCH_LOOK } from "./known-answer";
import { Reveal } from "./reveal";
import { VERDICT_LOOK } from "./verdict-card";

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

        {/* The cards come in one after another, row by row. */}
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map(({ caseId, run }, i) => {
            const verdict = run.verdict?.output.verdict;
            const known = KNOWN.get(caseId);
            const match = known && knownMatch(known, verdict ?? null);
            const confirmed = run.nodes.filter((n) => n.check.status !== "not_found").length;
            return (
              <li key={caseId} className="reveal-up" style={{ "--i": Math.min(i, 8) + 1 } as CSSProperties}>
                {/* On hover the card lifts a little off the page, the way a card on a desk would. */}
                <Link
                  href={`/cases/${caseId}`}
                  className="group/card flex h-full flex-col gap-2 rounded-sm border border-line bg-card p-4 transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span
                    className={`text-xs font-medium uppercase tracking-wider ${verdict ? VERDICT_LOOK[verdict] : "text-muted"}`}
                  >
                    {verdict ? verdictWords(verdict) : "No verdict"}
                  </span>
                  <span className="line-clamp-3 font-serif text-lg leading-snug">“{run.quote}”</span>
                  <span className="text-sm text-muted">Credited to {run.popularAttribution ?? "no one in particular"}</span>
                  <span className="mt-auto flex flex-col items-start gap-2 pt-2">
                    {match && <span className={`rounded-full px-2 py-0.5 text-xs ${MATCH_LOOK[match]}`}>{MATCH_CHIP[match]}</span>}
                    <span className="flex w-full items-center justify-between gap-2 border-t border-line pt-2 font-mono text-xs text-muted tabular-nums">
                      {plural(confirmed, "source")} · ${run.nebiusUsd.toFixed(4)} · {run.seconds}s
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
        </ul>
      </Reveal>
    </section>
  );
}
