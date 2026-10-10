import type { EvidenceNode } from "../agent/events";
import type { LineageStep } from "../agent/schemas";
import { Rationale } from "./verdict-card";

const CHANGE: Record<LineageStep["change"], { label: string; look: string }> = {
  first: { label: "First seen", look: "bg-accent text-white" },
  wording: { label: "Wording changes", look: "bg-foreground/10 text-foreground" },
  translation: { label: "In another language", look: "bg-warn/15 text-warn" },
  credit: { label: "Credit changes", look: "bg-bad/15 text-bad" },
};

const MAX_STEPS = 6;

// How the saying got to the form people share, as the judge traced it: where it
// first appears, then each change in wording, language or credit, in the judge's
// order. A step on a page the Verifier didn't confirm is left out. The cards show
// no year: a page's date may be its own or that of the work it cites, and which
// one a step means is in its note. The timeline below has the dates.
export function Lineage({ steps, nodes }: { steps: readonly LineageStep[]; nodes: readonly EvidenceNode[] }) {
  const confirmed = new Map(nodes.filter((n) => n.check.status !== "not_found").map((n) => [n.id, n]));
  const shown = steps
    .flatMap((step) => {
      const node = confirmed.get(step.node);
      return node ? [{ step, node }] : [];
    })
    .slice(0, MAX_STEPS);
  // One step is just the earliest page, which the verdict already names.
  if (shown.length < 2) return null;
  const ids = new Set(confirmed.keys());

  return (
    <section aria-label="How the quote changed">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">How it got to the version people share</h2>
      <ol className="-mx-4 flex flex-col gap-2 overflow-x-auto px-4 pb-2 sm:flex-row sm:items-stretch">
        {shown.map(({ step, node }, i) => (
          <li key={`${node.id}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {i > 0 && (
              <span aria-hidden className="self-center text-muted">
                <span className="sm:hidden">↓</span>
                <span className="hidden sm:inline">→</span>
              </span>
            )}
            <div className="arrive h-full rounded-xl border border-line bg-card p-3 shadow-sm sm:w-60 sm:shrink-0">
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHANGE[step.change].look}`}>
                  {CHANGE[step.change].label}
                </span>
                <a
                  href={`#node-${node.id}`}
                  className="truncate underline decoration-line underline-offset-2 hover:decoration-foreground"
                >
                  <span className="font-mono">{node.id}</span> {node.host}
                </a>
              </div>
              <p className="mt-2 text-sm leading-snug">
                <Rationale text={step.note} confirmed={ids} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
