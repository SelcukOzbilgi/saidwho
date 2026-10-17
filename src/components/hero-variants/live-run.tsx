import Link from "next/link";
import type { CSSProperties } from "react";

import { SNIPPET_NOT_ON_PAGE, SNIPPET_NOT_THE_SAYING } from "../../agent/events";
import type { ExampleCase } from "../../cases/cases";
import { MODEL_NAME } from "../../lib/model-name";
import { type Tier, verdictWords } from "../../lib/run-state";
import { HeroReplay } from "../hero-replay";
import { VERDICT_LOOK } from "../verdict-card";
import styles from "./live-run.module.css";
import type { HeroCaseProps } from "./types";

// /?hero=run: the featured case's own run played back in short. The panel
// starts from what the run was given, the quote and the name it is shared
// under, then its six steps land one after another with the numbers the saved
// events hold, and it ends on what the run found: the name struck out, the
// earliest trace written in, the verdict, and what the run took.
//
// The steps fill like the spans in n1m4mz's Agent Trace on 21st.dev, with their
// counts ticking up as each one runs. The pace is the panel's own: a saved run
// keeps how long it took in all, not when each step ran, so the only time shown
// is the run's total.

type StepName = "Planner" | "Search" | "Readers" | "Checker" | "Genealogist" | "Judge";

// What a step did, with its numbers kept apart from the words so each can count up.
export type RunStep = { name: StepName; said: (string | number)[] };

const CHECKER_REASONS = new Set([SNIPPET_NOT_ON_PAGE, SNIPPET_NOT_THE_SAYING]);

const word = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

// The steps as the saved events tell them. Events before the Genealogist's
// first round are the first pass of searching, reading and checking; those
// after it are its rounds. A step the run has no event for is left out, and so
// is any number it doesn't keep.
export function runSteps({ events, run }: Pick<ExampleCase, "events" | "run">): RunStep[] {
  let tracing = false;
  let planned: { queries: number; variants: number } | null = null;
  let searches = 0;
  let pages: number | null = null;
  const read = new Set<string>();
  let reread = 0;
  let rereadOn: Tier | null = null;
  let kept = 0;
  let thrown = 0;
  let rounds = 0;
  let roundPages = 0;
  let roundKept = 0;
  let judged = false;

  for (const e of events) {
    if (e.type === "traced" || e.type === "trace_failed") tracing = true;
    if (e.type === "traced") rounds = Math.max(rounds, e.round);
    if (e.type === "planned") planned = { queries: e.queries.length, variants: e.variants.length };
    if (e.type === "verdict" || e.type === "judge_skipped" || e.type === "judge_failed") judged = true;
    if (tracing) {
      if (e.type === "pages_ready" && e.round !== undefined) roundPages += e.pages;
      if (e.type === "node_added" && e.node.check.status !== "not_found") roundKept++;
      continue;
    }
    if (e.type === "searched") searches++;
    if (e.type === "pages_ready" && e.round === undefined) pages = e.pages;
    if (e.type === "page_read") read.add(e.url);
    if (e.type === "escalated" && e.step === "read") {
      reread++;
      // Rereads all go to one model; if they ever don't, the line names none.
      rereadOn = reread === 1 || rereadOn === e.to ? e.to : null;
      if (CHECKER_REASONS.has(e.reason)) thrown++;
    }
    if (e.type === "node_added") {
      // A crossed-out card is a snippet the Checker turned down that stayed down.
      if (e.node.check.status === "not_found") thrown++;
      else kept++;
    }
  }

  const confirmed = run.nodes.filter((n) => n.check.status !== "not_found").length;
  const steps: RunStep[] = [];

  if (planned) {
    steps.push({
      name: "Planner",
      said: [
        "Planned ",
        planned.queries,
        ` ${word(planned.queries, "search", "searches")}`,
        ...(planned.variants ? [", ", planned.variants, ` other ${word(planned.variants, "wording")}`] : []),
      ],
    });
  }
  if (searches) {
    steps.push({
      name: "Search",
      said: [
        "Ran ",
        searches,
        ` ${word(searches, "search", "searches")}`,
        ...(pages !== null ? [", ", pages, ` ${word(pages, "page")} to read`] : []),
      ],
    });
  }
  if (read.size) {
    steps.push({
      name: "Readers",
      said: [
        "Read ",
        read.size,
        ` ${word(read.size, "page")}`,
        ...(reread ? [", ", reread, rereadOn ? ` again on ${MODEL_NAME[rereadOn]}` : " again"] : []),
      ],
    });
  }
  if (kept || thrown) {
    steps.push({
      name: "Checker",
      said: ["Kept ", kept, ` ${word(kept, "snippet")}, `, ...(thrown ? ["threw ", thrown, " out"] : ["threw none out"])],
    });
  }
  if (tracing) {
    steps.push({
      name: "Genealogist",
      said: rounds
        ? [rounds, ` ${word(rounds, "round")} back, `, roundPages, ` more ${word(roundPages, "page")}, `, roundKept, " kept"]
        : ["Found nothing older to follow"],
    });
  }
  if (judged) steps.push({ name: "Judge", said: ["Weighed ", confirmed, ` kept ${word(confirmed, "page")}`] });
  return steps;
}

// When each part starts, in ms after the page opens: the credit, then the steps
// one after another, then what the run found. A step runs for STEP; the Readers
// and the Genealogist get a little longer, since they do the most.
// Short enough that the answer lands about four seconds in.
const CREDIT = 150;
const FIRST = 400;
const STEP = 330;
const LONGER = 150;
const GAP = 40;
const LONG: ReadonlySet<StepName> = new Set(["Readers", "Genealogist"]);

export function playTimes(steps: readonly RunStep[]) {
  let t = FIRST;
  const times = steps.map((step) => {
    const dur = STEP + (LONG.has(step.name) ? LONGER : 0);
    const start = t;
    t += dur + GAP;
    return { start, dur };
  });
  // Then the result: the strike, the trace written in, the verdict pressed on, the totals.
  return { times, strike: t + 80, trace: t + 350, verdict: t + 1200, totals: t + 1350 };
}

const ms = (n: number) => `${n}ms`;
const at = (n: number) => ({ "--at": ms(n) }) as CSSProperties;

// A number that counts up from zero while its step runs and settles on the
// saved value. The value is always in the markup; the count is drawn over it
// only while the panel plays (live-run.module.css). pad keeps two digits, for
// the last places of a cost.
function Count({ value, pad = false }: { value: number; pad?: boolean }) {
  return (
    <span className={`${styles.count} ${pad ? styles.pad : ""}`} style={{ "--to": value } as CSSProperties}>
      <span className={styles.value}>{pad ? String(value).padStart(2, "0") : value}</span>
    </span>
  );
}

// The cost to four places, as the featured section gives it. Under a cent its
// last two places count up; anything else just lands.
function Cost({ usd }: { usd: number }) {
  const last = Math.round(usd * 10_000);
  if (last < 1 || last > 99) return <>${usd.toFixed(4)}</>;
  return (
    <>
      $0.00
      <Count value={last} pad />
    </>
  );
}

export function HeroLiveRun({ featured, trace, intro }: HeroCaseProps) {
  const { run, caseId } = featured;
  const { output, credit, earliest } = trace;
  const steps = runSteps(featured);
  const times = playTimes(steps);
  const sources = run.nodes.filter((n) => n.check.status !== "not_found").length;
  const href = `/cases/${caseId}`;
  const earliestNode = run.nodes.find((n) => n.id === output.earliest_node && n.check.status !== "not_found");

  return (
    <div className="mt-6 grid items-center gap-10 sm:mt-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
      {intro}

      <figure
        aria-label="The run behind one finished case, played back in short"
        // hero-trace: the global trace rules play the strike, the marker and the
        // written trace, HeroReplay plays it again, and reduced motion stops it all.
        className={`hero-trace ${styles.panel} rounded-sm border border-line bg-card px-5 py-4 shadow-sm sm:px-6`}
      >
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span>One saved run, played back</span>
          <HeroReplay />
        </div>

        <blockquote
          lang={run.language ?? undefined}
          dir="auto"
          className="mt-2 font-serif text-xl leading-snug italic sm:text-[1.4rem]"
        >
          “{run.quote}”
        </blockquote>
        {/* The name on its own line, as big as the trace that replaces it, so the strike reads as the run's answer. */}
        <p className="hero-step mt-2.5 text-xs font-medium tracking-wider text-muted uppercase" style={at(CREDIT)}>
          Usually credited to
        </p>
        <p className="hero-step mt-0.5 font-serif text-xl leading-snug sm:text-2xl" style={at(CREDIT)}>
          {/* s: no longer taken as right once the run is done. The name stays in the text, so it is still read out. */}
          <s className="strike no-underline" style={at(times.strike)}>
            {credit}
          </s>
        </p>

        <ol className="mt-3.5 border-t border-line text-sm">
          {steps.map((step, i) => {
            const { start, dur } = times.times[i];
            return (
              <li
                key={step.name}
                // On a phone the name sits over what the step did; from sm up they share a line.
                className="relative grid grid-cols-1 border-b border-line py-1.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-3 sm:py-1"
                style={{ "--start": ms(start), "--dur": ms(dur) } as CSSProperties}
              >
                <span className={`${styles.name} text-xs font-medium sm:text-sm`}>{step.name}</span>
                <span className={`${styles.said} min-w-0 text-muted`}>
                  {step.said.map((part, j) =>
                    typeof part === "number" ? (
                      <span key={j} className="font-medium text-foreground tabular-nums">
                        <Count value={part} />
                      </span>
                    ) : (
                      part
                    ),
                  )}
                </span>
                {/* The step's span: it fills while the step runs and fades once it is done. */}
                <span aria-hidden="true" className={`${styles.span} absolute inset-x-0 -bottom-px h-0.5 bg-accent`} />
              </li>
            );
          })}
        </ol>

        <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            {/* Arrives with the trace it names; until then its space stays held, so nothing moves. */}
            <p className="hero-step text-xs font-medium tracking-wider text-muted uppercase" style={at(times.trace - 150)}>
              Earliest trace found
            </p>
            <p className="mt-0.5 font-serif text-xl leading-snug text-accent-ink sm:text-2xl">
              <span className="sr-only">{earliest.trace}</span>
              <span aria-hidden="true" className="marker" style={at(times.verdict - 200)}>
                {Array.from(earliest.trace).map((char, i) => (
                  <span key={i} className="hero-char" style={{ ...at(times.trace), "--c": i } as CSSProperties}>
                    {char}
                  </span>
                ))}
              </span>
            </p>
            {earliest.via && (
              <p className="hero-step mt-0.5 text-sm text-muted" style={at(times.verdict - 200)}>
                via{" "}
                {earliestNode ? (
                  <Link
                    href={`${href}#node-${earliestNode.id}`}
                    className="underline decoration-line underline-offset-4 hover:text-foreground hover:decoration-foreground"
                  >
                    {earliest.via}
                  </Link>
                ) : (
                  earliest.via
                )}
              </p>
            )}
          </div>
          <p className="hero-step flex items-center gap-2 text-xs text-muted sm:flex-col sm:items-end sm:gap-1 sm:pt-0.5 sm:text-right" style={at(times.verdict)}>
            {/* Set like the case page's stamp, and pressed on as the run ends. */}
            <span
              className={`${styles.stamp} rounded-sm border-[1.5px] border-current px-2 py-0.5 text-sm font-semibold tracking-wider uppercase ${VERDICT_LOOK[output.verdict]}`}
            >
              {verdictWords(output.verdict)}
            </span>
            <span>{output.confidence} confidence</span>
          </p>
        </div>

        {/* What the run took in all, counted up once it is done. The rule and the link
            arrive with the totals, so the panel never shows an empty footer. */}
        <figcaption
          className="hero-step mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2.5"
          style={{ ...at(times.totals), "--start": ms(times.totals), "--dur": ms(700) } as CSSProperties}
        >
          <span className="font-mono text-xs text-muted tabular-nums">
            <Count value={sources} /> {word(sources, "source")} · <Cost usd={run.nebiusUsd} /> on Nebius
            {run.seconds !== null && (
              <>
                {" "}
                · <Count value={run.seconds} /> s
              </>
            )}
          </span>
          <Link href={href} className="text-sm underline decoration-line underline-offset-4 hover:decoration-foreground">
            See every step
          </Link>
        </figcaption>
      </figure>
    </div>
  );
}
