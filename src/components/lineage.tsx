import type { CSSProperties } from "react";

import type { EvidenceNode } from "../agent/events";
import { type LineageStep, MAX_LINEAGE_STEPS } from "../agent/schemas";
import { Enter, RevealList } from "./case-motion";
import { FOCUS_RING } from "./focus-ring";
import { Rationale } from "./verdict-card";

// Each kind of change has a chip and a marker on the line. The marker's shape
// differs too, so the kinds don't rest on color alone: the first page is a
// filled dot with a halo, a change of credit a filled dot, a change of wording
// or language an open ring.
export const CHANGE: Record<LineageStep["change"], { label: string; look: string; marker: string }> = {
  first: { label: "First seen", look: "bg-accent text-on-accent", marker: "size-3.5 bg-accent ring-4 ring-accent/20" },
  wording: { label: "Wording changes", look: "bg-foreground/10 text-foreground", marker: "size-3 border-2 border-foreground/45 bg-card" },
  translation: { label: "In another language", look: "bg-warn/15 text-warn", marker: "size-3 border-2 border-warn bg-card" },
  credit: { label: "Credit changes", look: "bg-bad/15 text-bad", marker: "size-3 bg-bad" },
};

// How the saying got to the form people share, as the judge traced it: where it
// first appears, then each change in wording, language or credit, in the judge's
// order. A step on a page the Checker didn't confirm is left out. The steps show
// no year: a page's date may be its own or that of the work it cites, and which
// one a step means is in its note. The timeline below has the dates.
//
// The steps sit on one line from the first page down, which reads the same at
// any width and can't break into rows the way a strip of cards did. The line
// draws itself from step to step when it comes into view.
export function Lineage({ steps, nodes }: { steps: readonly LineageStep[]; nodes: readonly EvidenceNode[] }) {
  const confirmed = new Map(nodes.filter((n) => n.check.status !== "not_found").map((n) => [n.id, n]));
  const shown = steps
    .flatMap((step) => {
      const node = confirmed.get(step.node);
      return node ? [{ step, node }] : [];
    })
    // The orchestrator keeps at most this many; older saved runs could hold more.
    .slice(0, MAX_LINEAGE_STEPS);
  // One step is just the earliest page, which the verdict already names, and a
  // list whose first step was left out has lost where it started.
  if (shown.length < 2 || shown[0].step.change !== "first") return null;
  const ids = new Set(confirmed.keys());

  return (
    <Enter as="section" aria-label="How the quote changed">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">How it got to the version people share</h2>
      <RevealList className="rounded-sm border border-line bg-card px-4 py-5 shadow-sm sm:px-5">
        {shown.map(({ step, node }, i) => (
          <li
            key={`${node.id}-${i}`}
            style={{ "--i": i } as CSSProperties}
            // Marker, then on a wide screen the chip and page in one column and the note in the next.
            className="relative grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3 pb-6 last:pb-0 lg:grid-cols-[1rem_17rem_minmax(0,1fr)] lg:gap-x-5"
          >
            {/* The stretch of line down to the next step, behind the markers. */}
            {i < shown.length - 1 && (
              <span aria-hidden className="lineage-segment absolute top-3 -bottom-3 left-[calc(0.5rem-0.5px)] w-px bg-foreground/25" />
            )}
            <span aria-hidden className="relative flex h-5 items-center justify-center">
              <span className={`lineage-marker block shrink-0 rounded-full ${CHANGE[step.change].marker}`} />
            </span>
            <div className="lineage-text flex min-w-0 items-center gap-2 text-xs text-muted">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[step.change].look}`}>
                {CHANGE[step.change].label}
              </span>
              <a
                href={`#node-${node.id}`}
                className={`-my-1 truncate rounded-sm py-1 underline decoration-line underline-offset-2 hover:decoration-foreground ${FOCUS_RING}`}
              >
                <span className="font-mono">{node.id}</span> {node.host}
              </a>
            </div>
            <p className="lineage-text col-start-2 mt-1.5 text-sm leading-snug lg:col-start-3 lg:mt-0">
              <Rationale text={step.note} confirmed={ids} />
            </p>
          </li>
        ))}
      </RevealList>
    </Enter>
  );
}
