import type { JudgeOutput } from "../agent/schemas";
import type { EvalCase } from "../eval/cases";
import { hostOf, verdictWords } from "../lib/run-state";
import { VERDICT_LOOK } from "./verdict-card";

// What the test set records for this quote, set next to what the run found.
export function KnownAnswer({ known, reached }: { known: EvalCase; reached: JudgeOutput["verdict"] | null }) {
  const { work, author, date } = known.earliest;
  const same = reached === known.verdict;

  return (
    <section aria-label="The known answer" className="rounded-xl border border-dashed border-line p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted">The known answer</span>
        <span className={`font-medium uppercase tracking-wider ${VERDICT_LOOK[known.verdict]}`}>
          {verdictWords(known.verdict)}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 ${same ? "bg-good/15 text-good" : "bg-warn/15 text-warn"}`}>
          {same ? "Same verdict as this run" : reached ? "This run's verdict differs" : "This run gave no verdict"}
        </span>
      </div>
      <p className="mt-2">
        Earliest known: {work}
        {author && `, by ${author}`}
        {date && `, ${date}`}.
      </p>
      <p className="mt-1 text-muted">{known.notes}</p>
      <p className="mt-2 text-xs text-muted">
        From{" "}
        {known.references.map((url, i) => (
          <span key={url}>
            {i > 0 && ", "}
            <a href={url} rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {hostOf(url)}
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}
