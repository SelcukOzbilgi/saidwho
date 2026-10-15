import type { JudgeOutput } from "../agent/schemas";
import type { EvalCase } from "../eval/cases";
import { hostOf } from "../lib/run-state";
import { VERDICT_LOOK } from "./verdict-card";

// The test set's verdict is about the popular credit, not the saying: a quote
// with no known source for its famous name can still have an earliest trace, so
// each label says whose credit it is about.
const KNOWN_LABEL: Record<JudgeOutput["verdict"], (name: string) => string> = {
  misattributed: (name) => `Misattributed to ${name}`,
  correct: (name) => `Correctly credited to ${name}`,
  contested: (name) => `Credit to ${name} is contested`,
  no_known_source: (name) => `No known source for ${name}`,
};

export type KnownMatch = "same" | "differs" | "none";

// Whether a run's verdict is the one the test set records. Only the verdict is
// compared, not the earliest trace.
export const knownMatch = (known: EvalCase, reached: JudgeOutput["verdict"] | null): KnownMatch =>
  reached === null ? "none" : reached === known.verdict ? "same" : "differs";

export const MATCH_LOOK: Record<KnownMatch, string> = {
  same: "bg-good/15 text-good",
  differs: "bg-warn/15 text-warn",
  none: "bg-foreground/10 text-muted",
};

const MATCH_WORDS: Record<KnownMatch, string> = {
  same: "Same verdict as this run",
  differs: "This run's verdict differs",
  none: "This run gave no verdict",
};

// What the test set records for this quote, set next to what the run found.
export function KnownAnswer({ known, reached }: { known: EvalCase; reached: JudgeOutput["verdict"] | null }) {
  const { work, author, date } = known.earliest;
  const match = knownMatch(known, reached);

  return (
    <section aria-label="The known answer" className="rounded-xl border border-dashed border-line p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium uppercase tracking-wider text-muted">The known answer</span>
        <span className={`font-medium uppercase tracking-wider ${VERDICT_LOOK[known.verdict]}`}>
          {KNOWN_LABEL[known.verdict](known.popular_attribution)}
        </span>
        <span className={`ml-auto rounded-full px-2 py-0.5 ${MATCH_LOOK[match]}`}>{MATCH_WORDS[match]}</span>
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
            <a href={url} rel="noopener noreferrer" className="py-1 underline underline-offset-2 hover:text-foreground">
              {hostOf(url)}
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}
