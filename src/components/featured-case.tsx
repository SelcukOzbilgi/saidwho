import Link from "next/link";

import type { EvidenceNode } from "../agent/events";
import { type LineageStep, MAX_LINEAGE_STEPS } from "../agent/schemas";
import type { ExampleCase } from "../cases/cases";
import { type RunState, verdictWords } from "../lib/run-state";
import { UltraSaving } from "./progress";
import { unmark } from "./timeline";
import { earliestTrace, HEADLINE, VERDICT_LOOK } from "./verdict-card";

// One finished case at the top of the home page, so a first visit shows what a
// run ends with before it asks for anything. It is a short version of the case
// page: the verdict, and the first few steps of how the saying changed, each
// linking to its card there. The full verdict card and lineage strip link their
// evidence ids to cards on the same page, which this page doesn't have, so this
// shows plain text and links to the case page instead.

const TRAIL_STEPS = 3;

const CHANGE: Record<LineageStep["change"], { label: string; look: string }> = {
  first: { label: "First seen", look: "bg-accent text-on-accent" },
  wording: { label: "Wording changes", look: "bg-foreground/10 text-foreground" },
  translation: { label: "In another language", look: "bg-warn/15 text-warn" },
  credit: { label: "Credit changes", look: "bg-bad/15 text-bad" },
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
    <section aria-labelledby="featured-title" className="rounded-2xl border border-line bg-card/60 p-5 shadow-sm sm:p-6">
      <p className="text-sm text-muted">One finished run, saved as it happened</p>
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

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div>
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
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">
              How it got to the version people share
            </h3>
            <ol className="flex flex-col gap-2">
              {steps.map(({ change, note, node }, i) => (
                <li key={`${node.id}-${i}`}>
                  <Link
                    href={`${href}#node-${node.id}`}
                    className="block rounded-xl border border-line bg-card p-3 transition-colors hover:border-foreground/40"
                  >
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[change].look}`}>
                        {CHANGE[change].label}
                      </span>
                      <span className="truncate">{node.host}</span>
                    </span>
                    <span className="mt-1.5 block text-sm leading-snug">{note}</span>
                  </Link>
                </li>
              ))}
            </ol>
            {more > 0 && (
              <p className="mt-2 text-xs text-muted">
                {more} more step{more === 1 ? "" : "s"} in the full case.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link
          href={href}
          className="rounded-lg bg-foreground px-5 py-2.5 font-medium text-background hover:bg-accent hover:text-on-accent"
        >
          See every step
        </Link>
        <a
          href="#run"
          className="rounded-lg border border-foreground px-5 py-2.5 font-medium hover:bg-foreground hover:text-background"
        >
          Run your own quote
        </a>
        <div className="flex flex-col gap-1 sm:ml-auto sm:items-end">
          <UltraSaving nebiusUsd={run.nebiusUsd} ultraUsd={run.ultraUsd} />
          <span className="font-mono text-xs text-muted tabular-nums">
            {sources} source{sources === 1 ? "" : "s"} · ${run.nebiusUsd.toFixed(4)} on Nebius
            {run.seconds !== null && ` · ${run.seconds}s`}
          </span>
        </div>
      </div>
    </section>
  );
}
