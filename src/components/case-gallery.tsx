import Link from "next/link";

import type { ExampleCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import { VERDICT_LOOK } from "./verdict-card";

export function CaseGallery({ cases }: { cases: readonly ExampleCase[] }) {
  return (
    <section aria-labelledby="cases-title">
      <h2 id="cases-title" className="font-serif text-3xl font-semibold">
        Finished cases
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        Real runs, saved as they happened. Open one to see every step and how it compares to the known answer, or
        watch it run again. No keys needed.
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map(({ caseId, run }) => {
          const verdict = run.verdict?.output.verdict;
          const confirmed = run.nodes.filter((n) => n.check.status !== "not_found").length;
          return (
            <li key={caseId}>
              <Link
                href={`/cases/${caseId}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-line bg-card p-4 transition-colors hover:border-foreground/40"
              >
                <span
                  className={`text-xs font-medium uppercase tracking-wider ${verdict ? VERDICT_LOOK[verdict] : "text-muted"}`}
                >
                  {verdict ? verdictWords(verdict) : "No verdict"}
                </span>
                <span className="line-clamp-3 font-serif text-lg leading-snug">“{run.quote}”</span>
                <span className="text-sm text-muted">Credited to {run.popularAttribution}</span>
                <span className="mt-auto pt-2 font-mono text-xs text-muted tabular-nums">
                  {confirmed} source{confirmed === 1 ? "" : "s"} · ${run.nebiusUsd.toFixed(4)} · {run.seconds}s
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
