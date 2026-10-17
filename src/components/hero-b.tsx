import Link from "next/link";
import type { CSSProperties } from "react";

import type { EvidenceNode } from "../agent/events";
import type { ExampleCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import type { heroTrace } from "./hero";
import { HeroReplay } from "./hero-replay";
import { HEADLINE, VERDICT_LOOK } from "./verdict-card";

// The second version of the hero's trace, shown at /?hero=b while one of the two
// is picked. The quote sits next to the copy, and under both runs a strip of
// years with a mark for each page the run kept, at the year that page gives for
// the saying. The marks land in the order the run found them, then the oldest
// is picked out and named. The strip is the year strip from eugeneshilow's
// Heat Strip on 21st.dev, its bars turned into one mark per page.

type Trace = NonNullable<ReturnType<typeof heroTrace>>;

export type StripMark = { id: string; host: string; year: number; stack: number; earliest: boolean };

// The pages the Checker kept that carry a year, in the order the run found them,
// each with its place in the stack for its year. A page's date is its own or
// that of the older work it cites (see the Reader in the orchestrator), which is
// why the strip says "the year it gives".
export function yearStrip(nodes: readonly EvidenceNode[], earliestId: string | null) {
  const kept = nodes.filter((n) => n.check.status !== "not_found");
  const stacks = new Map<number, number>();
  const marks: StripMark[] = [];
  for (const node of kept) {
    const year = Number(node.date?.slice(0, 4));
    if (!node.date || !Number.isInteger(year)) continue;
    const stack = stacks.get(year) ?? 0;
    stacks.set(year, stack + 1);
    marks.push({ id: node.id, host: node.host, year, stack, earliest: node.id === earliestId });
  }
  const years = marks.map((m) => m.year);
  // Two years of room at each end, so the end marks don't sit on the edge.
  const from = Math.min(...years) - 2;
  const to = Math.max(...years) + 2;
  const decades = [];
  for (let y = Math.ceil(from / 10) * 10; y <= to; y += 10) decades.push(y);
  return { marks, kept: kept.length, undated: kept.length - marks.length, from, to, decades };
}

// When each part starts, in ms after the page opens: the strip, then one mark
// every MARK_GAP, then the oldest is picked, named and judged.
const AT = { axis: 150, marks: 450 } as const;
const MARK_GAP = 70;
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

export function HeroQuote({ featured, credit }: { featured: ExampleCase; credit: string }) {
  return (
    <div className="lg:pb-1">
      <blockquote
        lang={featured.run.language ?? undefined}
        dir="auto"
        className="font-serif text-[1.65rem] leading-snug italic sm:text-[2rem] sm:leading-tight"
      >
        “{featured.run.quote}”
      </blockquote>
      <p className="mt-3 text-muted sm:text-lg">
        Usually credited to <span className="text-foreground">{credit}</span>
      </p>
    </div>
  );
}

export function HeroStrip({ featured, trace }: { featured: ExampleCase; trace: Trace }) {
  const { output, credit, earliest } = trace;
  const strip = yearStrip(featured.run.nodes, output.earliest_node);
  const plotted = strip.marks.length >= 2;
  const span = strip.to - strip.from;
  const x = (year: number) => `${((year - strip.from) / span) * 100}%`;
  const oldest = strip.marks.find((m) => m.earliest);
  const picked = AT.marks + strip.marks.length * MARK_GAP + 150;

  return (
    <figure
      aria-label="What one run found for this quote"
      // globals.css plays the strip only where scripts run and motion is welcome.
      className="hero-trace border-t border-line pt-4"
    >
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span>
          {plotted
            ? `The pages the Checker kept, each at the year it gives for the saying${strip.undated > 0 ? `; ${strip.undated} ${strip.undated === 1 ? "gives" : "give"} none` : ""}`
            : "One quote, traced"}
        </span>
        <HeroReplay />
      </div>

      {plotted && (
        <div aria-hidden="true" className="mt-3">
          {/* The marks stand on the line, those of one year stacked in the order they were found. */}
          <div className="relative h-10 [--step:11px] sm:h-12 sm:[--step:15px]">
            <span className="hero-axis absolute inset-x-0 bottom-0 h-px bg-foreground/40" style={at(AT.axis)} />
            {strip.marks.map((mark, i) => (
              <span
                key={mark.id}
                title={`${mark.host}, ${mark.year}`}
                className="absolute -ml-1 size-2 sm:-ml-1.5 sm:size-3"
                style={{ left: x(mark.year), bottom: `calc(5px + ${mark.stack} * var(--step))` }}
              >
                <span
                  className="hero-mark block size-full rounded-full border-[1.5px] border-foreground/60 bg-card"
                  style={at(AT.marks + i * MARK_GAP)}
                />
                {/* The oldest lands like the rest and is filled in once all are down. */}
                {mark.earliest && (
                  <>
                    <span className="hero-pick absolute inset-0 rounded-full bg-accent" style={at(picked)} />
                    <span className="hero-pick absolute -inset-[3px] rounded-full ring-[3px] ring-accent/25 sm:-inset-[5px] sm:ring-4" style={at(picked + 80)} />
                  </>
                )}
              </span>
            ))}
          </div>
          <div className="relative mt-1.5 h-4 font-mono text-[10px] tracking-wider text-muted tabular-nums">
            {strip.decades.map((year) => (
              <span key={year} className="absolute -translate-x-1/2" style={{ left: x(year) }}>
                {year}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-x-10 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        {/* The oldest mark, named; a line down from it on the strip joins the two. */}
        <div
          className="hero-step relative"
          style={{ ...at(picked + 200), ...(plotted && oldest ? { marginLeft: `max(0px, calc(${x(oldest.year)} - 0.6rem))` } : {}) }}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Earliest trace found</p>
          <p className="mt-1 font-serif text-2xl text-accent-ink">
            <span className="marker" style={at(picked + 500)}>
              {earliest.trace}
            </span>
          </p>
          {earliest.via && <p className="mt-0.5 text-sm text-muted">via {earliest.via}</p>}
        </div>

        <figcaption className="hero-step text-sm sm:text-right" style={at(picked + 700)}>
          <span className={`text-xs font-medium uppercase tracking-wider ${VERDICT_LOOK[output.verdict]}`}>
            {verdictWords(output.verdict)}
          </span>
          <span className="text-muted"> · {output.confidence} confidence</span>
          <span className="mt-0.5 block font-medium">{HEADLINE[output.verdict](credit)}</span>
          <Link
            href={`/cases/${featured.caseId}`}
            className="mt-1 inline-block underline decoration-line underline-offset-4 hover:decoration-foreground"
          >
            See every step
          </Link>
        </figcaption>
      </div>
    </figure>
  );
}
