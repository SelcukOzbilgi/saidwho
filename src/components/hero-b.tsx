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
// years with a mark for each page the Checker kept, placed as the case page's
// timeline places it. The marks land in the order the run found them, then the
// oldest is picked out and named, and only then is the credit next to the quote
// struck out and the verdict given. The strip is the year strip from
// eugeneshilow's Heat Strip on 21st.dev, its bars turned into one mark per page.

type Trace = NonNullable<ReturnType<typeof heroTrace>>;

export type StripMark = { id: string; host: string; year: number; stack: number; earliest: boolean };

// The pages the Checker kept that carry a year, in the order the run found them,
// each with its place in the stack for its year. A page's date is its own or
// that of the older work it cites (see the Reader in the orchestrator), the
// same date the case page's timeline sorts by.
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
  return { marks, kept: kept.length, undated: kept.length - marks.length, first: Math.min(...years), last: Math.max(...years), from, to, decades };
}

// When each part starts, in ms after the page opens: the strip, then one mark
// every MARK_GAP, then the oldest is picked and named, and after it the credit
// is struck and the verdict given.
const AT = { axis: 150, marks: 450 } as const;
const MARK_GAP = 70;
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

export function stripTimes(marks: number) {
  const picked = AT.marks + marks * MARK_GAP + 150;
  return { picked, label: picked + 200, marker: picked + 500, strike: picked + 750, verdict: picked + 1050 };
}

// The quote, its credit and what the run made of it, next to the copy. The
// credit is struck once the strip below has picked out the oldest page.
export function HeroQuote({ featured, trace }: { featured: ExampleCase; trace: Trace }) {
  const { output, credit } = trace;
  const times = stripTimes(yearStrip(featured.run.nodes, output.earliest_node).marks.length);

  return (
    <div>
      <blockquote
        lang={featured.run.language ?? undefined}
        dir="auto"
        className="font-serif text-[1.65rem] leading-snug italic sm:text-[2rem] sm:leading-tight"
      >
        “{featured.run.quote}”
      </blockquote>
      <p className="mt-3 text-muted sm:text-lg">
        Usually credited to{" "}
        <s className="strike text-foreground no-underline" style={at(times.strike)}>
          {credit}
        </s>
      </p>
      <div className="hero-step mt-5 border-t border-line pt-4 text-sm" style={at(times.verdict)}>
        <span className={`text-xs font-medium uppercase tracking-wider ${VERDICT_LOOK[output.verdict]}`}>
          {verdictWords(output.verdict)}
        </span>
        <span className="text-muted"> · {output.confidence} confidence</span>
        <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium">{HEADLINE[output.verdict](credit)}</span>
          <Link
            href={`/cases/${featured.caseId}`}
            className="underline decoration-line underline-offset-4 hover:decoration-foreground"
          >
            See every step
          </Link>
        </div>
      </div>
    </div>
  );
}

export function HeroStrip({ featured, trace }: { featured: ExampleCase; trace: Trace }) {
  const { output, earliest } = trace;
  const strip = yearStrip(featured.run.nodes, output.earliest_node);
  const plotted = strip.marks.length >= 2;
  const span = strip.to - strip.from;
  const x = (year: number) => `${((year - strip.from) / span) * 100}%`;
  const oldest = strip.marks.find((m) => m.earliest);
  const times = stripTimes(strip.marks.length);

  return (
    // The section around it carries hero-trace, so the strip and the struck credit play as one.
    <figure aria-label="What one run found for this quote" className="border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <span>
          {plotted
            ? `Where the quote turns up, a mark for each page the Checker kept${strip.undated > 0 ? `; ${strip.undated} ${strip.undated === 1 ? "gives" : "give"} no year` : ""}`
            : "One quote, traced"}
        </span>
        <HeroReplay />
      </div>

      {plotted && (
        <>
          <p className="sr-only">
            {strip.marks.length} dated pages, from {strip.first} to {strip.last}.
          </p>
          <div aria-hidden="true" className="mt-2">
            {/* The marks stand on the line, those of one year stacked in the order they were found. */}
            <div className="relative h-8 [--step:8px] sm:h-10 sm:[--step:12px]">
              <span className="hero-axis absolute inset-x-0 bottom-0 h-px bg-foreground/40" style={at(AT.axis)} />
              {strip.marks.map((mark, i) => (
                <span
                  key={mark.id}
                  title={`${mark.year}: ${mark.host}`}
                  // The oldest sits above its neighbours, so a page from the next year can't cover it.
                  className={`absolute -ml-[3px] size-1.5 sm:-ml-[5px] sm:size-2.5 ${mark.earliest ? "z-10" : ""}`}
                  style={{ left: x(mark.year), bottom: `calc(5px + ${mark.stack} * var(--step))` }}
                >
                  <span
                    className="hero-mark block size-full rounded-full border border-foreground/60 bg-card sm:border-[1.5px]"
                    style={at(AT.marks + i * MARK_GAP)}
                  />
                  {/* The oldest lands like the rest and is filled in once all are down. */}
                  {mark.earliest && (
                    <>
                      <span className="hero-pick absolute inset-0 rounded-full bg-accent" style={at(times.picked)} />
                      <span
                        className="hero-pick absolute -inset-[2px] rounded-full ring-2 ring-accent/25 sm:-inset-[4px] sm:ring-[3px]"
                        style={at(times.picked + 80)}
                      />
                    </>
                  )}
                </span>
              ))}
            </div>
            <div className="relative mt-1 h-4 font-mono text-[10px] tracking-wider text-muted tabular-nums">
              {strip.decades.map((year) => (
                <span key={year} className="absolute -translate-x-1/2" style={{ left: x(year) }}>
                  {year}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {/* The oldest mark, named, starting under it on the strip. */}
      <p
        className="hero-step mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
        style={{ ...at(times.label), ...(plotted && oldest ? { marginLeft: `max(0px, calc(${x(oldest.year)} - 0.6rem))` } : {}) }}
      >
        <span className="text-xs font-medium uppercase tracking-wider text-muted">Earliest trace found</span>
        <span className="font-serif text-xl text-accent-ink sm:text-2xl">
          <span className="marker" style={at(times.marker)}>
            {earliest.trace}
          </span>
        </span>
        {earliest.via && <span className="text-sm text-muted">via {earliest.via}</span>}
      </p>
    </figure>
  );
}
