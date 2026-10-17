import { RotateCcw } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { CASCADE, type Tier } from "../agent/models";
import { LEADS_PER_ROUND, MAX_PAGES, MAX_QUERIES, TRACE_ROUNDS } from "../agent/orchestrator";
import { findCase } from "../cases/cases";
import type { CheckerRejections } from "../cases/checker-rejections";
import { MODEL_NAME } from "../lib/model-name";
import { plural } from "../lib/plural";
import { Reveal } from "./reveal";
import { RunMap, stepAnchor, ToolChip } from "./run-map";
import { TierChip } from "./tier-chip";

// The six steps of a run, for the home page: a card that plays a run through
// them, and next to it what each step does. Which model each step uses comes
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
    does: `Go through up to ${MAX_PAGES} pages from the searches, and the ones the Genealogist turns up, and copy the sentence that carries the quote, who it's credited to, the date, and any older source the page names.`,
    model: { first: CASCADE.read.tier, retry: CASCADE.reread.tier },
  },
  {
    name: "Checker",
    does:
      "Looks for each copied sentence in the page's own text, allowing small differences in wording, and checks it is the saying and not some other line. " +
      "It's plain code, not AI, so a snippet with no close match on the page is thrown out.",
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
      "Writes the verdict from the confirmed pages only. Code checks every page it cites. A verdict that cites one the Checker didn't confirm is set aside, and the Judge can try once more on a bigger model if the run's limits allow.",
    model: { first: CASCADE.judge.tier, retry: CASCADE.rejudge.tier },
  },
];

// The crossed-out card the counts link to, cut to a line or two, for the
// Checker's step: what a thrown-out snippet looks like, from a real run.
function crossedOutSnippet(example: CheckerRejections["example"]) {
  if (!example) return null;
  const found = findCase(example.caseId);
  const node = found?.run.nodes.find((n) => n.id === example.nodeId);
  if (!found || !node?.reader.exact_snippet) return null;
  const text = node.reader.exact_snippet.trim();
  // Cut at the last space before 120 characters, or at 120 when there is no
  // space late enough (a long URL, or a language written without spaces).
  const space = text.lastIndexOf(" ", 120);
  const cut = text.length <= 120 ? text : `${text.slice(0, space > 60 ? space : 120).replace(/[,;:.]$/, "")}…`;
  // The map shows only the start of it, cut at a word.
  const short = text.length <= 36 ? text : `${text.slice(0, Math.max(text.lastIndexOf(" ", 36), 20)).replace(/[,;:.]$/, "")}…`;
  return { text: cut, short, host: node.host, quote: found.run.quote };
}

export function HowItWorks({ rejections, cases }: { rejections: CheckerRejections; cases: number }) {
  const { rejected, rescued, crossedOut, example } = rejections;
  const snippet = crossedOutSnippet(example);
  const rounds = `up to ${plural(TRACE_ROUNDS, "round")}`;

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-6">
      <Reveal>
        <h2 id="how-title" className="reveal-up font-serif text-3xl font-semibold sm:text-4xl">
          How it works
        </h2>
        <p className="reveal-up mt-2 max-w-2xl text-muted">
          Six steps, each with one job. The models are NVIDIA Nemotron, served by Nebius Token Factory, and the search is
          Tavily. {MODEL_NAME[CASCADE.read.tier]} reads every page; a bigger model reads a page again, or writes the
          verdict again, only when a call or a check fails.
        </p>
      </Reveal>

      {/* The card plays a run through the steps; on a wide screen it stays in view
          while the list next to it says what each step does. */}
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--site-header-height,4.25rem)+1.5rem)]">
          <RunMap steps={STEPS} rounds={TRACE_ROUNDS} roundsLabel={rounds} thrownOut={snippet?.short ?? null} />
        </div>

        <Reveal>
          <ol className="flex flex-col">
            {STEPS.map((step, i) => {
              const checker = step.name === "Checker";
              return (
                <li
                  key={step.name}
                  id={stepAnchor(step.name)}
                  className="reveal-up scroll-mt-6 border-t border-line py-7 first:border-t-0 first:pt-0 last:pb-0"
                  style={{ "--i": i } as CSSProperties}
                >
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <span className="font-mono text-xs text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-serif text-2xl font-semibold">{step.name}</h3>
                    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {step.model && <TierChip tier={step.model.first} />}
                      {step.model?.retry && (
                        <>
                          then <TierChip tier={step.model.retry} /> on a retry
                        </>
                      )}
                      {step.tool && <ToolChip>{step.tool}</ToolChip>}
                    </p>
                  </div>
                  <p className="mt-3 max-w-2xl leading-relaxed text-foreground/85">{step.does}</p>
                  {step.name === "Genealogist" && (
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-accent-ink">
                      <RotateCcw aria-hidden="true" className="size-3.5 -scale-x-100" />
                      Back to the Readers, {rounds}
                    </p>
                  )}
                  {checker && rejected > 0 && (
                    <p className="mt-4 max-w-2xl border-t border-line pt-4 text-sm">
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
                  {checker && snippet && (
                    <figure className="mt-3 max-w-2xl rounded-sm border border-dashed border-bad/40 bg-bad/5 px-3 py-2.5">
                      <blockquote className="font-serif text-[15px] leading-snug text-foreground/70">
                        <s className="decoration-bad decoration-[0.09em]">“{snippet.text}”</s>
                      </blockquote>
                      <figcaption className="mt-1.5 text-xs text-muted">
                        Crossed out in the case for “{snippet.quote}”: a sentence a Reader copied from {snippet.host}.
                      </figcaption>
                    </figure>
                  )}
                </li>
              );
            })}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
