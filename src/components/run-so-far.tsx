import { plural } from "../lib/plural";
import type { Phase, RunState } from "../lib/run-state";
import { Arrivals, Enter } from "./case-motion";

type Props = Pick<RunState, "phase" | "plan" | "searches" | "pages" | "readUrls" | "nodes"> & {
  // Whether the run log already announces each step to screen readers. A replay's
  // log doesn't, so this card says the step instead, once per step.
  announce?: boolean;
};

const STEP: Record<Phase, string> = {
  planning: "Planning",
  searching: "Searching",
  reading: "Reading and checking pages",
  tracing: "Following cited works",
  judging: "Judging",
};

// Stands where the verdict will go while a run is under way, so a replay or a
// live run has something to read from its first moment: the step it is on, and
// the Planner's plan once there is one.
export function RunSoFar({ phase, plan, searches, pages, readUrls, nodes, announce = false }: Props) {
  const confirmed = nodes.filter((n) => n.check.status !== "not_found").length;
  const now: Record<Phase, string> = {
    planning: "The Planner is choosing what to search for",
    searching: `Searching the web: ${plural(searches, "search", "searches")} done`,
    reading: `Reading pages: ${readUrls.length} of ${plural(pages ?? 0, "page")}, ${confirmed} confirmed`,
    tracing: "Following the older works the pages cite",
    judging: "The Judge is weighing the pages",
  };

  return (
    <section aria-label="The run so far" className="rounded-sm border border-dashed border-line bg-card/60 p-5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
        Under way
      </p>
      {/* Each new step's words rise in where the last one's were. */}
      <Arrivals>
        <Enter key={phase} rise={6}>
          <h2 className="mt-2 font-serif text-2xl leading-tight font-semibold">{now[phase]}</h2>
        </Enter>
      </Arrivals>
      {!announce && (
        <span className="sr-only" aria-live="polite">
          {STEP[phase]}
        </span>
      )}
      <p className="mt-1 text-sm text-muted">The verdict shows up here once the Judge has weighed what the pages say.</p>

      {plan && (
        <div className="arrive mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">The Planner&apos;s searches</h3>
            <ol className="flex flex-col gap-1 text-foreground/85">
              {plan.queries.map((query, i) => (
                <li key={i} className="break-words">
                  {query}
                </li>
              ))}
            </ol>
          </div>
          {(plan.variants.length > 0 || plan.candidateAuthors.length > 0) && (
            <div className="flex flex-col gap-4">
              {plan.variants.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">Other wordings to look for</h3>
                  <ul className="flex flex-col gap-1 font-serif italic text-foreground/85">
                    {plan.variants.map((variant, i) => (
                      <li key={i} className="break-words">
                        “{variant}”
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.candidateAuthors.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">Names to check</h3>
                  <p className="text-foreground/85">{plan.candidateAuthors.join(", ")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
