import { Fragment } from "react";

import type { JudgeOutput } from "../agent/schemas";
import { type RunState, verdictWords } from "../lib/run-state";
import { TierChip } from "./tier-chip";

export const VERDICT_LOOK: Record<JudgeOutput["verdict"], string> = {
  misattributed: "text-bad",
  correct: "text-good",
  contested: "text-warn",
  no_known_source: "text-muted",
};

// name is null only when no one was named: the visitor left it blank and the
// planner didn't know. With no credit to weigh, the headline only points to the
// evidence; the earliest trace below says where it leads.
const HEADLINE: Record<JudgeOutput["verdict"], (name: string | null) => string> = {
  misattributed: (name) => (name ? `${name} probably didn't say it` : "What the sources show"),
  correct: (name) => (name ? `${name} said it` : "What the sources show"),
  contested: (name) => (name ? `Whether ${name} said it is contested` : "Where it comes from is contested"),
  no_known_source: () => "No source old enough to settle it",
};

type Props = Pick<RunState, "verdict" | "noVerdict" | "stopped" | "finished" | "popularAttribution" | "nodes">;

export function VerdictCard({ verdict, noVerdict, stopped, finished, popularAttribution, nodes }: Props) {
  if (!verdict) {
    if (!noVerdict && !finished) return null;
    return (
      <section className="rounded-xl border border-line bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">No verdict</p>
        <p className="mt-1 text-lg">
          {noVerdict ? capitalize(noVerdict) : stopped === "budget" ? "The run hit its spending limit first." : "The run ended before a verdict."}
        </p>
      </section>
    );
  }

  const { output, tier, unknownIds } = verdict;
  const confirmed = new Set(nodes.filter((n) => n.check.status !== "not_found").map((n) => n.id));

  return (
    <section aria-label="Verdict" className="arrive rounded-xl border border-line bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className={`font-medium uppercase tracking-wider ${VERDICT_LOOK[output.verdict]}`}>{verdictWords(output.verdict)}</span>
        <span>· {output.confidence} confidence</span>
        <span className="ml-auto flex items-center gap-1.5">
          judged on <TierChip tier={tier} />
        </span>
      </div>

      <h2 className="mt-2 font-serif text-3xl leading-tight font-semibold">{HEADLINE[output.verdict](popularAttribution)}</h2>

      {(output.earliest_author || output.earliest_date) && (
        <p className="mt-3 text-sm">
          Earliest trace:{" "}
          <strong>
            {[output.earliest_author, output.earliest_date].filter(Boolean).join(", ")}
          </strong>
          {output.earliest_node && (
            <>
              {" "}
              <Cite id={output.earliest_node} confirmed={confirmed} />
            </>
          )}
        </p>
      )}

      <p className="mt-3 leading-relaxed text-foreground/85">
        <Rationale text={output.rationale} confirmed={confirmed} />
      </p>

      {unknownIds.length > 0 && (
        <p role="alert" className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          Read this one with care: it leans on {unknownIds.join(", ")}, which no page backed up.
        </p>
      )}
    </section>
  );
}

// The judge cites evidence as n3, [n3] or (n3, n5); each id becomes a link to
// its card. It also writes titles in markdown emphasis, shown here as italics,
// and sometimes puts the ids themselves in bold.
export function Rationale({ text, confirmed }: { text: string; confirmed: ReadonlySet<string> }) {
  const plain = text.replace(/\[(n\d+(?:\s*,\s*n\d+)*)\]/g, "$1");
  return plain.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\b_[^_\n]+_\b)/g).map((part, i) => {
    if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{cited(part.slice(2, -2), confirmed)}</strong>;
    if (/^([*_]).+\1$/.test(part)) return <em key={i}>{cited(part.slice(1, -1), confirmed)}</em>;
    return <Fragment key={i}>{cited(part, confirmed)}</Fragment>;
  });
}

function cited(text: string, confirmed: ReadonlySet<string>) {
  return text
    .split(/(\bn\d+\b)/g)
    .map((part, i) => (/^n\d+$/.test(part) ? <Cite key={i} id={part} confirmed={confirmed} /> : part));
}

function Cite({ id, confirmed }: { id: string; confirmed: ReadonlySet<string> }) {
  if (!confirmed.has(id)) {
    return (
      <span title="Not backed up by a page" className="mx-0.5 rounded bg-bad/15 px-1 font-mono text-xs text-bad line-through">
        {id}
      </span>
    );
  }
  return (
    <a
      href={`#node-${id}`}
      className="mx-0.5 rounded bg-accent/15 px-1 font-mono text-xs text-accent no-underline hover:bg-accent/25"
    >
      {id}
    </a>
  );
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
