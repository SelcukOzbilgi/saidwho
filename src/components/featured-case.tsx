import Link from "next/link";
import type { CSSProperties } from "react";

import type { EvidenceNode } from "../agent/events";
import { type LineageStep, MAX_LINEAGE_STEPS } from "../agent/schemas";
import type { ExampleCase } from "../cases/cases";
import { type RunState, verdictWords } from "../lib/run-state";
import { UltraSaving } from "./progress";
import { Reveal } from "./reveal";
import { OpenRunLink } from "./run-sheet";
import { unmark } from "./timeline";
import { earliestTrace, HEADLINE, VERDICT_LOOK } from "./verdict-card";

// One finished case at the top of the home page, so a first visit shows what a
// run ends with before it asks for anything. It is a short version of the case
// page: the verdict, and the first few steps of how the saying changed, each
// linking to its card there. The full verdict card and lineage strip link their
// evidence ids to cards on the same page, which this page doesn't have, so this
// shows plain text and links to the case page instead.

const TRAIL_STEPS = 3;

// The chip and the dot on the line for each kind of step, the same as the
// case page's lineage.
const CHANGE: Record<LineageStep["change"], { label: string; look: string; dot: string }> = {
  first: { label: "First seen", look: "bg-accent text-on-accent", dot: "bg-accent" },
  wording: { label: "Wording changes", look: "bg-foreground/10 text-foreground", dot: "bg-foreground/40" },
  translation: { label: "In another language", look: "bg-warn/15 text-warn", dot: "bg-warn" },
  credit: { label: "Credit changes", look: "bg-bad/15 text-bad", dot: "bg-bad" },
};

// The judge's notes cite evidence as n3, [n3], (n3, n5), 【n3】 or "n1, n2, and
// n7", and sometimes mark titles in Markdown. Here there are no cards to point
// to, so both go, lists with their commas and "and". An n3 inside a URL stays.
export const plainNote = (text: string): string =>
  unmark(text)
    .replace(/\s*[[(【（]\s*n\d+(?:\s*,\s*n\d+)*\s*[\])】）]/g, "")
    .replace(/\s*(?<!https?:\/\/\S*)\bn\d+(?:\s*,\s*(?:(?:and|or)\s+)?n\d+)*(?:\s*,?\s+(?:and|or)\s+n\d+)?\b/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

export type TrailStep = { change: LineageStep["change"]; note: string; node: EvidenceNode };

// The same steps the case page's lineage strip shows: only those on a page the
// checker confirmed, and none at all when the first one was left out. Then the
// first few of them, and how many more the case page has. As on the strip, no
// year: a page's date may be its own or that of the work it cites.
export function trailOf(run: RunState, max: number = TRAIL_STEPS): { steps: TrailStep[]; more: number } {
  const confirmed = new Map(run.nodes.filter((n) => n.check.status !== "not_found").map((n) => [n.id, n]));
  const all = (run.verdict?.output.lineage ?? [])
    .flatMap((step) => {
      const node = confirmed.get(step.node);
      return node ? [{ change: step.change, note: plainNote(step.note), node }] : [];
    })
    .slice(0, MAX_LINEAGE_STEPS);
  if (all.length < 2 || all[0].change !== "first") return { steps: [], more: 0 };
  return { steps: all.slice(0, max), more: Math.max(0, all.length - max) };
}

export function FeaturedCase({ example }: { example: ExampleCase }) {
  const { caseId, run } = example;
  const output = run.verdict?.output;
  if (!output) return null;
  const href = `/cases/${caseId}`;
  const { steps, more } = trailOf(run);
  const sources = run.nodes.filter((n) => n.check.status !== "not_found").length;
  const earliest = earliestTrace(output, run.nodes);

  return (
    <section
      id="featured"
      aria-labelledby="featured-title"
      className="scroll-mt-6 rounded-sm border border-line bg-card p-5 shadow-sm sm:p-8"
    >
      <Reveal>
        <p className="reveal-up text-sm text-muted">One finished run, saved as it happened</p>
        <blockquote
          lang={run.language ?? undefined}
          dir="auto"
          className="reveal-up mt-2 font-serif text-2xl leading-snug italic sm:text-3xl"
        >
          “{run.quote}”
        </blockquote>
        {run.popularAttribution && (
          <p className="reveal-up mt-1 text-muted">
            Usually credited to <span className="text-foreground">{run.popularAttribution}</span>
          </p>
        )}

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="reveal-up" style={{ "--i": 1 } as CSSProperties}>
            <p className="text-xs text-muted">
              <span className={`font-medium uppercase tracking-wider ${VERDICT_LOOK[output.verdict]}`}>
                {verdictWords(output.verdict)}
              </span>{" "}
              · {output.confidence} confidence
            </p>
            <h2 id="featured-title" className="mt-1 font-serif text-3xl leading-tight font-semibold">
              {HEADLINE[output.verdict](run.popularAttribution)}
            </h2>
            {earliest && (
              <p className="mt-3 text-sm">
                Earliest trace: <strong>{earliest.trace}</strong>
                {earliest.via && `, via ${earliest.via}`}
              </p>
            )}
            {/* On a phone it is cut to three lines, so the trail still makes the first screen; the case page has all of it. */}
            <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/85 sm:line-clamp-none sm:text-base">
              {plainNote(output.rationale)}
            </p>
          </div>

          {steps.length > 0 && (
            <div>
              <h3 className="reveal-up mb-4 text-xs font-medium uppercase tracking-wider text-muted" style={{ "--i": 2 } as CSSProperties}>
                How it got to the version people share
              </h3>
              {/* A line down the left joins the steps, oldest first, and draws in as they arrive. */}
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="reveal-draw-y absolute top-2 bottom-2 left-[calc(0.3125rem-0.5px)] w-px bg-line"
                  style={{ "--i": 2 } as CSSProperties}
                />
                <ol className="flex flex-col gap-5">
                  {steps.map(({ change, note, node }, i) => (
                    <li
                      key={`${node.id}-${i}`}
                      className="reveal-up relative pl-7"
                      style={{ "--i": i + 3 } as CSSProperties}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1 left-0 size-2.5 rounded-full ring-4 ring-card ${CHANGE[change].dot}`}
                      />
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[change].look}`}>
                          {CHANGE[change].label}
                        </span>
                        <Link
                          href={`${href}#node-${node.id}`}
                          className="truncate text-muted underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground"
                        >
                          {node.host}
                        </Link>
                      </span>
                      <span className="mt-1.5 block text-sm leading-snug">{note}</span>
                    </li>
                  ))}
                </ol>
              </div>
              {more > 0 && (
                <p className="mt-4 pl-7 text-xs text-muted">
                  {more} more step{more === 1 ? "" : "s"} in the{" "}
                  <Link href={href} className="underline decoration-line underline-offset-4 hover:decoration-foreground">
                    full case
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </div>

        <div className="reveal-up mt-8 flex flex-col items-start gap-3 border-t border-line pt-6 sm:flex-row sm:items-center" style={{ "--i": 4 } as CSSProperties}>
          <Link
            href={href}
            className="rounded-sm bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent hover:text-on-accent"
          >
            See every step
          </Link>
          <OpenRunLink className="rounded-sm border border-foreground px-5 py-2.5 font-medium hover:bg-foreground hover:text-background">
            Run your own quote
          </OpenRunLink>
          <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
            <UltraSaving nebiusUsd={run.nebiusUsd} ultraUsd={run.ultraUsd} />
            <span className="font-mono text-xs text-muted tabular-nums">
              {sources} source{sources === 1 ? "" : "s"} · ${run.nebiusUsd.toFixed(4)} on Nebius
              {run.seconds !== null && ` · ${run.seconds}s`}
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
