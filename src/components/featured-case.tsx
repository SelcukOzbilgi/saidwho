import Link from "next/link";
import type { CSSProperties } from "react";

import type { EvidenceNode } from "../agent/events";
import { type LineageStep, MAX_LINEAGE_STEPS } from "../agent/schemas";
import type { ExampleCase } from "../cases/cases";
import { type RunState, verdictWords } from "../lib/run-state";
import { UltraSaving } from "./progress";
import { type Cue, FeaturedPlay, type Plan } from "./featured-play";
import { CHANGE } from "./lineage";
import { RUN_PAGE } from "./sections";
import { unmark } from "./timeline";
import { earliestTrace, HEADLINE, VERDICT_LOOK } from "./verdict-card";

// One finished case at the top of the home page, so a first visit shows what a
// run ends with before it asks for anything. It is a short version of the case
// page: the verdict, and the first few steps of how the saying changed, each
// linking to its card there. The full verdict card and lineage strip link their
// evidence ids to cards on the same page, which this page doesn't have, so this
// shows plain text and links to the case page instead.

const TRAIL_STEPS = 3;

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

// The section plays what the run found, in order, as it scrolls into view:
// on a wide screen, where the trail sits beside the verdict, the steps land
// down their line one after another (the marker with its ring, the change chip
// sliding out from the line, then the page and note, and the line drawing on to
// the next marker), and as the last one lands the verdict is pressed on, the
// reasoning under it, and the cost last. On a phone the verdict sits above the
// trail, so it plays in reading order: verdict, then trail, then cost, each
// part waiting until it is on screen. FeaturedPlay starts the parts; each
// element's own offset within its part is in the Home: featured case block of
// globals.css. The server renders the finished section, which is what shows
// without JavaScript, with reduced motion, or when the section is already on
// screen as the page opens.

// From one step landing to the next; the line takes most of it to draw down.
const STEP = 500;

// The step a trail line belongs to lands this long after the trail starts.
const stepAt = (i: number) => 150 + i * STEP;

// The order the parts play in for each layout, and how long each waits after
// the one before it starts. steps is how many steps the trail shows.
export function playPlan(steps: number): Plan {
  if (steps === 0) {
    const cues: Cue[] = [
      { act: "verdict", gap: 0 },
      { act: "footer", gap: 650 },
    ];
    return { wide: cues, narrow: cues };
  }
  const lastLands = stepAt(steps - 1);
  return {
    // The verdict lands with the last step, so a quick scroll still sees it.
    wide: [
      { act: "trail", gap: 0 },
      { act: "verdict", gap: lastLands + 200 },
      { act: "footer", gap: 650 },
    ],
    // Here the cost row comes after the trail has settled.
    narrow: [
      { act: "verdict", gap: 0 },
      { act: "trail", gap: 700 },
      { act: "footer", gap: lastLands + 500 },
    ],
  };
}

const startAt = (ms: number) => ({ "--start": `${ms}ms` }) as CSSProperties;

// afterHero: the hero above already shows the quote, the name it is shared
// under and the earliest trace, so this section starts at the verdict.
export function FeaturedCase({ example, afterHero = false }: { example: ExampleCase; afterHero?: boolean }) {
  const { caseId, run } = example;
  const output = run.verdict?.output;
  if (!output) return null;
  const href = `/cases/${caseId}`;
  const { steps, more } = trailOf(run);
  const sources = run.nodes.filter((n) => n.check.status !== "not_found").length;
  const earliest = earliestTrace(output, run.nodes);
  const plan = playPlan(steps.length);

  return (
    <section
      id="featured"
      aria-labelledby="featured-title"
      className="scroll-mt-6 rounded-sm border border-line bg-card p-5 shadow-sm sm:p-8"
    >
      <FeaturedPlay plan={plan}>
        <p className="text-sm text-muted">
          {afterHero ? "The run behind that trace, saved as it happened" : "One finished run, saved as it happened"}
        </p>
        {!afterHero && (
          <>
            <blockquote
              lang={run.language ?? undefined}
              dir="auto"
              className="mt-2 font-serif text-2xl leading-snug italic sm:text-3xl"
            >
              “{run.quote}”
            </blockquote>
            {run.popularAttribution && (
              <p className="mt-1 text-muted">
                Usually credited to <span className="text-foreground">{run.popularAttribution}</span>
              </p>
            )}
          </>
        )}

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <div className="fc-part" data-act="verdict">
            <p className="text-xs text-muted">
              {/* Set like the case page's verdict stamp, and pressed on once the trail has led to it. */}
              <span
                className={`fc-stamp inline-block rounded-sm border-[1.5px] border-current px-1.5 py-px font-semibold uppercase tracking-wider ${VERDICT_LOOK[output.verdict]}`}
              >
                {verdictWords(output.verdict)}
              </span>{" "}
              <span className="fc-after inline-block">· {output.confidence} confidence</span>
            </p>
            <h2 id="featured-title" className="fc-headline mt-1 font-serif text-3xl leading-tight font-semibold">
              {HEADLINE[output.verdict](run.popularAttribution)}
            </h2>
            {earliest && !afterHero && (
              <p className="fc-reason mt-3 text-sm">
                Earliest trace: <strong>{earliest.trace}</strong>
                {earliest.via && `, via ${earliest.via}`}
              </p>
            )}
            {/* On a phone it is cut to three lines, so the trail still makes the first screen; the case page has all of it. */}
            <p className="fc-reason mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/85 sm:line-clamp-none sm:text-base">
              {plainNote(output.rationale)}
            </p>
          </div>

          {steps.length > 0 && (
            <div className="fc-part" data-act="trail">
              <h3 className="fc-heading mb-4 text-xs font-medium uppercase tracking-wider text-muted">
                How it got to the version people share
              </h3>
              {/* The steps sit on one line, oldest first, and play down it one at a time: the
                  marker lands, the change chip slides out from the line, the page and note
                  follow, and the line draws on to the next step as it lands. Markers, chips
                  and line are the case page's lineage, so the two read as one thing. */}
              <ol className="flex flex-col" style={{ "--draw": `${STEP - 100}ms` } as CSSProperties}>
                {steps.map(({ change, note, node }, i) => (
                  <li
                    key={`${node.id}-${i}`}
                    className="fc-part relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0"
                    style={startAt(stepAt(i))}
                  >
                    {/* The stretch of line down to the next step, behind the markers. */}
                    {i < steps.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="fc-segment absolute top-2.5 -bottom-2.5 left-[calc(0.5rem-0.5px)] w-px bg-foreground/25"
                      />
                    )}
                    <span aria-hidden="true" className="relative flex h-5 items-center justify-center">
                      <span className={`fc-marker lineage-marker block shrink-0 rounded-full ${CHANGE[change].marker}`} />
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={`fc-chip shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[change].look}`}>
                        {CHANGE[change].label}
                      </span>
                      <Link
                        href={`${href}#node-${node.id}`}
                        className="fc-note truncate text-muted underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground"
                      >
                        {node.host}
                      </Link>
                    </span>
                    <span className="fc-note col-start-2 mt-1.5 block text-sm leading-snug">{note}</span>
                  </li>
                ))}
              </ol>
              {more > 0 && (
                <p className="fc-part fc-heading mt-4 pl-7 text-xs text-muted" style={startAt(stepAt(steps.length - 1) + 300)}>
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

        <div
          className="fc-part fc-footer mt-8 flex flex-col items-start gap-3 border-t border-line pt-6 sm:flex-row sm:items-center"
          data-act="footer"
        >
          <Link
            href={href}
            className="rounded-sm bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent hover:text-on-accent"
          >
            See every step
          </Link>
          <Link
            href={RUN_PAGE.href}
            className="rounded-sm border border-foreground px-5 py-2.5 font-medium hover:bg-foreground hover:text-background"
          >
            Run your own quote
          </Link>
          <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
            <UltraSaving nebiusUsd={run.nebiusUsd} ultraUsd={run.ultraUsd} />
            <span className="font-mono text-xs text-muted tabular-nums">
              {sources} source{sources === 1 ? "" : "s"} · ${run.nebiusUsd.toFixed(4)} on Nebius
              {run.seconds !== null && ` · ${run.seconds}s`}
            </span>
          </div>
        </div>
      </FeaturedPlay>
    </section>
  );
}
