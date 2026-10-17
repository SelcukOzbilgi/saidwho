import Link from "next/link";
import type { CSSProperties } from "react";

import type { LineageStep } from "../../agent/schemas";
import { verdictWords } from "../../lib/run-state";
import { trailOf } from "../featured-case";
import { HeroReplay } from "../hero-replay";
import { CHANGE } from "../lineage";
import { HEADLINE, VERDICT_LOOK } from "../verdict-card";
import styles from "./rewind.module.css";
import type { HeroCaseProps } from "./types";

// /?hero=rewind: the case as a file whose trail runs back in time. The quote
// and the name it is shared under sit on top; under them the steps of the
// judge's lineage, newest first, down to the earliest trace. As the page opens
// the steps arrive one by one, then the earliest trace's year runs back from
// the year of the run and lands, its dot is marked, the work is written in
// beside it, and the verdict is set down last. Only the earliest trace's year
// is printed: the other steps carry none on purpose, since a page's date may be
// its own or that of the work it cites. The count runs only on the earliest
// row, before its text is there, so no year it passes stands beside a step.

// When the first step arrives, how far apart the steps arrive, and how long the
// year takes to run back, in ms. The count is linear and quick, so the years it
// passes go by too fast to read as dates.
const FIRST_AT = 150;
const STEP_MS = 420;
const COUNT_MS = 650;
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

type Row = { key: string; change: LineageStep["change"]; text: string; node: { id: string; host: string } };

// What the file shows, all from the saved run: the newer steps newest first,
// the earliest trace, and the years the counter runs between. The steps are the
// featured section's (the first few, on pages the checker confirmed); where the
// run has none, the file is the quote, the credit and the earliest trace.
export function rewindFile({ featured, trace }: Pick<HeroCaseProps, "featured" | "trace">) {
  const { run } = featured;
  const { steps, more } = trailOf(run);
  const date = trace.output.earliest_date;
  const year = date?.match(/^\d{4}/)?.[0] ?? null;
  const from = Number(featured.ranAt.slice(0, 4));

  // The earliest row is the judge's earliest trace. When the trail starts on the
  // same page, that step is this row, so it shows once; otherwise the trail's
  // first step keeps its own row above it.
  const node = run.nodes.find((n) => n.id === trace.output.earliest_node && n.check.status !== "not_found");
  const merged = steps.length > 0 && steps[0].node.id === node?.id;
  const rows: Row[] = (merged ? steps.slice(1) : steps)
    .map((s, i) => ({ key: `${s.node.id}-${i}`, change: s.change, text: s.note.replace(/\.$/, ""), node: s.node }))
    .reverse();

  // The year is drawn large in the row, so the text beside it doesn't print it
  // again: "1980, Narcotics Anonymous literature" and "Winston Churchill, 1940"
  // read as the work or the author beside the year, and a trace that is only a
  // year is the year alone. A screen reader hears the trace as the judge gave it.
  const full = trace.earliest.trace;
  const text = !date
    ? full
    : full === date
      ? null
      : full.startsWith(`${date}, `)
        ? full.slice(date.length + 2)
        : full.endsWith(`, ${date}`)
          ? full.slice(0, -(date.length + 2))
          : full;

  return {
    rows,
    earliest: { text, via: trace.earliest.via ?? node?.host ?? null, node: node?.id ?? null, first: merged || steps.length === 0 },
    more,
    year,
    // It only counts back: a trace dated after the run is an odd date, so it just shows.
    count: year && from > Number(year) ? { from, to: Number(year) } : null,
  };
}

// The dot, then the step. The trail's line runs down the dots' column.
const ROW = "grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3";
const FIRST_RING = "size-3 border-2 border-accent bg-card";
const LINK = "underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground";

// The stretch of the trail's line from a row's dot down to the next one's. It
// draws down as the next row arrives, so the line follows the reading back.
function Segment({ at: ms }: { at: number }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.segment} absolute top-3 -bottom-6 left-[calc(0.5rem-0.5px)] w-px bg-foreground/25`}
      style={{ ...at(ms + 120), "--rewind-run": `${STEP_MS}ms` } as CSSProperties}
    />
  );
}

export function HeroRewind({ featured, trace, intro }: HeroCaseProps) {
  const { run, caseId } = featured;
  const { output, credit } = trace;
  const href = `/cases/${caseId}`;
  const { rows, earliest, more, year, count } = rewindFile({ featured, trace });
  const sources = run.nodes.filter((n) => n.check.status !== "not_found").length;

  // The steps arrive STEP_MS apart, the "more steps" row first. The earliest
  // row arrives with only its dot and year, the year runs back and lands, and
  // then its text is written in, the credit is struck where the run found it
  // wrong, and the verdict is set down.
  const arrive = (i: number) => FIRST_AT + (i + (more > 0 ? 1 : 0)) * STEP_MS;
  const counting = arrive(rows.length) + 60;
  const land = count ? counting + COUNT_MS : arrive(rows.length) + 200;
  const struck = output.verdict === "misattributed";

  return (
    <div className="mt-6 grid items-center gap-10 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
      {intro}

      <figure
        aria-label="One finished case, traced back"
        // hero-trace: HeroReplay plays it again, and globals.css plays its steps,
        // strike and marker, and keeps it all still under reduced motion.
        className={`hero-trace ${styles.file} rounded-sm border border-line bg-card p-5 shadow-sm sm:p-6`}
      >
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="font-mono tabular-nums">
            <span className="hidden sm:inline">Case file · </span>
            {sources} source{sources === 1 ? "" : "s"} · ${run.nebiusUsd.toFixed(4)}
            {run.seconds !== null && ` · ${run.seconds}s`}
          </span>
          <HeroReplay />
        </div>

        <blockquote
          lang={run.language ?? undefined}
          dir="auto"
          className="mt-3 font-serif text-2xl leading-snug italic sm:text-[1.65rem]"
        >
          “{run.quote}”
        </blockquote>
        <p className="mt-2 text-sm text-muted">
          Shared as{" "}
          {struck ? (
            // s: no longer taken as right. The line is drawn over it once the trail is read.
            <s className="strike font-serif text-lg text-foreground no-underline" style={at(land + 450)}>
              {credit}
            </s>
          ) : (
            <span className="font-serif text-lg text-foreground">{credit}</span>
          )}
        </p>

        {/* Each row: the trail's dot, then the step. Only the earliest row has a year. */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-3 text-xs font-medium tracking-wider text-muted uppercase">
            {rows.length > 0 || more > 0 ? "Traced back, newest first" : "Earliest trace found"}
          </p>
          <ol className="flex flex-col gap-3">
            {more > 0 && (
              <li className={`hero-step ${ROW} relative text-xs text-muted`} style={at(FIRST_AT)}>
                <Segment at={FIRST_AT} />
                <span aria-hidden="true" className="relative flex h-5 items-center justify-center">
                  <span className="block size-1.5 rounded-full bg-foreground/35" />
                </span>
                <Link href={href} className={`self-center ${LINK}`}>
                  {more} more step{more === 1 ? "" : "s"} in the full case
                </Link>
              </li>
            )}
            {rows.map((row, i) => (
              <li key={row.key} className={`hero-step ${ROW} relative`} style={at(arrive(i))}>
                <Segment at={arrive(i)} />
                <span aria-hidden="true" className="relative flex h-6 items-center justify-center">
                  {/* Where the trail's first page isn't the earliest trace, its dot is an open
                      ring, so the filled one stays the earliest trace's alone. */}
                  <span className={`block shrink-0 rounded-full ${row.change === "first" ? FIRST_RING : CHANGE[row.change].marker}`} />
                </span>
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                  <span className={row.change === "credit" ? "font-serif text-lg leading-6" : "text-sm leading-6"}>{row.text}</span>
                  <Link href={`${href}#node-${row.node.id}`} className={`truncate text-xs text-muted ${LINK}`}>
                    {row.node.host}
                  </Link>
                </span>
              </li>
            ))}
            {/* The earliest row arrives in parts: its dot and year first, the year runs
                back and lands, then the work is written in beside it. */}
            <li className={`${ROW} relative`}>
              <span aria-hidden="true" className="hero-step relative flex h-9 items-center justify-center sm:h-10" style={at(arrive(rows.length))}>
                <span className={`${styles.landing} block shrink-0 rounded-full ${CHANGE.first.marker}`} style={at(land)} />
              </span>
              <span className="min-w-0">
                <span className="sr-only">{trace.earliest.trace}</span>
                <span aria-hidden="true" className="flex flex-wrap items-baseline gap-x-3 font-serif text-accent-ink">
                  {year && (
                    <span className="hero-step inline-block text-[2rem] leading-9 font-semibold tabular-nums sm:text-[2.4rem] sm:leading-10" style={at(arrive(rows.length))}>
                      {/* The year in the markup keeps the box's width; the module draws the
                          count over it. A trace that is only a year is marked here. */}
                      <span
                        className={`${count ? styles.count : ""} ${earliest.text ? "" : "marker"} relative`}
                        style={{ ...at(land + 150), "--count-at": `${counting}ms`, "--count-run": `${COUNT_MS}ms`, "--rewind-from": count?.from, "--rewind-to": count?.to } as CSSProperties}
                      >
                        {year}
                      </span>
                    </span>
                  )}
                  {earliest.text && (
                    <span className="hero-step inline-block text-xl leading-7 sm:text-[1.4rem]" style={at(land - 80)}>
                      <span className="marker" style={at(land + 150)}>
                        {earliest.text}
                      </span>
                    </span>
                  )}
                </span>
                <span className="hero-step mt-0.5 block text-xs text-muted" style={at(land)}>
                  {earliest.first ? "First seen" : "Earliest trace"}
                  {earliest.via && " · via "}
                  {earliest.via &&
                    (earliest.node ? (
                      <Link href={`${href}#node-${earliest.node}`} className={LINK}>
                        {earliest.via}
                      </Link>
                    ) : (
                      earliest.via
                    ))}
                </span>
              </span>
            </li>
          </ol>
        </div>

        <figcaption
          className="hero-step mt-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-t border-line pt-4"
          style={at(land + 600)}
        >
          <span>
            <span className="flex items-center gap-2 text-xs text-muted">
              <span
                className={`${styles.stamp} rounded-sm border-[1.5px] border-current px-1.5 py-px font-semibold tracking-wider uppercase ${VERDICT_LOOK[output.verdict]}`}
                style={at(land + 650)}
              >
                {verdictWords(output.verdict)}
              </span>
              {output.confidence} confidence
            </span>
            <span className="mt-1.5 block font-serif text-xl leading-tight font-semibold">{HEADLINE[output.verdict](credit)}</span>
          </span>
          <Link href={href} className={`text-sm ${LINK}`}>
            See every step
          </Link>
        </figcaption>
      </figure>
    </div>
  );
}
