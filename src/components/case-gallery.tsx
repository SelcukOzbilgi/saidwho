import Link from "next/link";

import type { ExampleCase } from "../cases/cases";
import { KNOWN } from "../cases/known";
import { plural } from "../lib/plural";
import { verdictWords } from "../lib/run-state";
import { type KnownMatch, knownMatch, MATCH_LOOK } from "./known-answer";
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
      <h2 id="cases-title" className="font-serif text-3xl font-semibold">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        Real runs, saved as they happened. Open one to see every step and how it compares to the known answer, or
        watch it run again. No keys needed.
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map(({ caseId, run }) => {
          const verdict = run.verdict?.output.verdict;
          const known = KNOWN.get(caseId);
          const match = known && knownMatch(known, verdict ?? null);
          const confirmed = run.nodes.filter((n) => n.check.status !== "not_found").length;
          return (
            <li key={caseId}>
              <Link
                href={`/cases/${caseId}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-line bg-card p-4 transition-colors hover:border-foreground/40"
              >
                <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                  <span className={`font-medium uppercase tracking-wider ${verdict ? VERDICT_LOOK[verdict] : "text-muted"}`}>
                    {verdict ? verdictWords(verdict) : "No verdict"}
                  </span>
                  {match && <span className={`rounded-full px-2 py-0.5 ${MATCH_LOOK[match]}`}>{MATCH_CHIP[match]}</span>}
                </span>
                <span className="line-clamp-3 font-serif text-lg leading-snug">“{run.quote}”</span>
                <span className="text-sm text-muted">Credited to {run.popularAttribution ?? "no one in particular"}</span>
                <span className="mt-auto pt-2 font-mono text-xs text-muted tabular-nums">
                  {plural(confirmed, "source")} · ${run.nebiusUsd.toFixed(4)} · {run.seconds}s
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
