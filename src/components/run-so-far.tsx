import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { plural } from "../lib/plural";
import type { LogEntry, Phase, RunState } from "../lib/run-state";
import { Enter, Pop, Swap } from "./case-motion";
import { Tick } from "./tick";
import { unmark } from "./timeline";

type Props = Pick<RunState, "phase" | "plan" | "searches" | "pages" | "readUrls" | "nodes" | "leads" | "log"> & {
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

export type SearchMark = { state: "done" | "failed" | "now" | "waiting"; results: number | null };

// Where each of the Planner's searches has got, from the Search lines in the
// log, which name the query they ran. Searches run one at a time in the plan's
// order, so while the run is searching, the first one not yet back is the one
// under way. A query the run widened shows the plain query's result, and a
// last query a widened one took the place of stays waiting.
export function searchMarks(queries: readonly string[], log: readonly LogEntry[], searching: boolean): SearchMark[] {
  const back = new Map<string, SearchMark>();
  for (const entry of log) {
    if (entry.agent !== "Search") continue;
    const found = /^(\d+) results? for ([^]*)$/.exec(entry.text);
    if (found) back.set(found[2], { state: "done", results: Number(found[1]) });
    else if (entry.text.startsWith("Search failed (")) {
      const at = entry.text.indexOf("): ");
      if (at > 0) back.set(entry.text.slice(at + 3), { state: "failed", results: null });
    }
  }
  let next = searching;
  return queries.map((query) => {
    const mark = back.get(query);
    if (mark) return mark;
    if (next) {
      next = false;
      return { state: "now", results: null };
    }
    return { state: "waiting", results: null };
  });
}

// The plan's lines come in one after another, in the order the Planner gave
// them, a beat apart. The pace of the activity list in starc007's Agent
// Activity on 21st.dev.
const BEAT = 0.06;
const at = (i: number) => Math.min(i, 12) * BEAT;

// Stands where the verdict will go while a run is under way, so a replay or a
// live run has something to read from its first moment: the step it is on, and
// the Planner's plan once there is one, each search ticked off as it comes back.
// The marks follow n1m4mz's Agent Trace on 21st.dev: a search not yet run is
// set in the muted color, and its result shows only once it is back.
export function RunSoFar({ phase, plan, searches, pages, readUrls, nodes, leads, log, announce = false }: Props) {
  const confirmed = nodes.filter((n) => n.check.status !== "not_found").length;
  const now: Record<Phase, ReactNode> = {
    planning: "The Planner is choosing what to search for",
    searching: (
      <>
        Searching the web: <Tick value={searches} /> {searches === 1 ? "search" : "searches"} done
      </>
    ),
    reading: (
      <>
        Reading pages: <Tick value={readUrls.length} /> of <Tick value={pages ?? 0} /> {pages === 1 ? "page" : "pages"},{" "}
        <Tick value={confirmed} /> confirmed
      </>
    ),
    tracing: "Following the older works the pages cite",
    judging: "The Judge is weighing the pages",
  };
  const marks = plan ? searchMarks(plan.queries, log, phase === "searching") : [];
  const wordingsFrom = plan ? plan.queries.length : 0;
  const namesFrom = plan ? wordingsFrom + plan.variants.length : 0;

  return (
    <section aria-label="The run so far" className="rounded-sm border border-dashed border-line bg-card/60 p-5">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
        <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden />
        Under way
      </p>
      {/* Each new step's words lift the last one's away and rise into their place. */}
      <Swap id={phase}>
        <h2 className="mt-2 font-serif text-2xl leading-tight font-semibold">{now[phase]}</h2>
      </Swap>
      {!announce && (
        <span className="sr-only" aria-live="polite">
          {STEP[phase]}
        </span>
      )}
      <p className="mt-1 text-sm text-muted">The verdict shows up here once the Judge has weighed what the pages say.</p>

      {plan && (
        <Enter rise={0} className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">The Planner&apos;s searches</h3>
            <ol className="flex flex-col gap-1">
              {plan.queries.map((query, i) => (
                <Enter as="li" key={i} rise={6} delay={at(i)} className="flex gap-2">
                  <SearchMarker state={marks[i].state} />
                  <span className={`min-w-0 break-words transition-colors duration-300 ${marks[i].state === "waiting" ? "text-muted" : "text-foreground/85"}`}>
                    {query}{" "}
                    {marks[i].results !== null && (
                      <Enter as="span" key="results" rise={0} className="ml-0.5 font-mono text-[11px] whitespace-nowrap text-muted">
                        {plural(marks[i].results!, "result")}
                      </Enter>
                    )}
                    {marks[i].state === "failed" && <span className="ml-0.5 font-mono text-[11px] text-bad">failed</span>}
                  </span>
                </Enter>
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
                      <Enter as="li" key={i} rise={6} delay={at(wordingsFrom + i)} className="break-words">
                        “{variant}”
                      </Enter>
                    ))}
                  </ul>
                </div>
              )}
              {plan.candidateAuthors.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">Names to check</h3>
                  <ul className="flex flex-wrap gap-x-1 text-foreground/85">
                    {plan.candidateAuthors.map((name, i) => (
                      <Enter as="li" key={i} rise={6} delay={at(namesFrom + i)}>
                        {name}
                        {i < plan.candidateAuthors.length - 1 && ","}
                      </Enter>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {leads.length > 0 && (
            <div className="sm:col-span-2">
              <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted">Older works to look for</h3>
              <ul className="flex flex-col gap-1 text-foreground/85">
                {leads.map((lead, i) => (
                  <Enter as="li" key={i} rise={6} delay={at(i)} className="break-words">
                    {unmark(lead.work)} <span className="font-mono text-[11px] text-muted">cited by {lead.fromNode}</span>
                  </Enter>
                ))}
              </ul>
            </div>
          )}
        </Enter>
      )}
    </section>
  );
}

// A search's mark: an open ring while it waits, a beating dot while it runs, a
// tick once it is back and a cross if it failed. Each new mark lands in place.
function SearchMarker({ state }: { state: SearchMark["state"] }) {
  return (
    <span aria-hidden className="flex h-5 w-3.5 shrink-0 items-center justify-center">
      <Pop key={state}>
        {state === "done" ? (
          <Check className="size-3.5 text-good" strokeWidth={2.5} />
        ) : state === "failed" ? (
          <X className="size-3.5 text-bad" strokeWidth={2.5} />
        ) : state === "now" ? (
          <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" />
        ) : (
          <span className="size-2 rounded-full border-[1.5px] border-muted/60" />
        )}
      </Pop>
    </span>
  );
}
