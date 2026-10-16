import Link from "next/link";
import type { CSSProperties } from "react";

import type { ExampleCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import { HeroReplay } from "./hero-replay";
import { Wordmark } from "./logo-mark";
import { OpenRunLink } from "./run-sheet";
import { earliestTrace, HEADLINE, VERDICT_LOOK } from "./verdict-card";

// The first screen: the name, what the app does, and the featured case told in
// one move. The quote and the name it is shared under come first, then the
// name is struck out and the earliest trace the run found is written in. All of
// it comes from the saved run, so it says what the case page says.

// When each part of the trace starts, in ms after the page opens.
const AT = { credit: 250, strike: 700, origin: 1150, marker: 2050, verdict: 2250 };
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

// Sets data-play on the trace while the page is parsed, before anything is
// painted, so it starts from its first frame instead of showing its end and
// jumping back. Without JavaScript, or with reduced motion, it isn't set, and
// the trace shows how it ends.
const PLAY = `(function(s){try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)s.previousElementSibling.setAttribute("data-play","")}catch(e){}})(document.currentScript)`;

const BUTTON = "inline-flex items-center gap-2 rounded-sm px-5 py-3 font-medium transition-colors";

export function Hero({ featured }: { featured: ExampleCase | undefined }) {
  const output = featured?.run.verdict?.output;
  const credit = featured?.run.popularAttribution;
  const earliest = output && featured ? earliestTrace(output, featured.run.nodes) : null;

  return (
    <section
      aria-labelledby="hero-title"
      // The first screen, less the sticky header, so the featured case starts below the fold.
      className="flex min-h-[calc(100svh-var(--site-header-height,6.5rem))] flex-col justify-center py-8 sm:min-h-[calc(100svh-var(--site-header-height,4rem))] sm:py-10"
    >
      <h1 id="hero-title" className="font-serif text-[clamp(4rem,15vw,10.5rem)] leading-[0.95] font-semibold tracking-tight">
        <Wordmark />
      </h1>

      <div className="mt-6 grid items-start gap-10 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div>
          <p className="max-w-xl text-lg leading-7 sm:text-xl sm:leading-8">
            Ask a chatbot where a quote comes from and it will often guess a source. Said Who? goes and finds the pages
            and their dates, and a check written in plain code, not AI, throws out any snippet it can&apos;t find on the
            page.
          </p>
          <p className="mt-3 max-w-xl leading-7 text-muted sm:text-lg sm:leading-8">
            Paste a quote you saw online and find out where it first appeared, with a link for every step.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {featured && (
              <a href="#featured" className={`${BUTTON} bg-foreground text-background hover:bg-accent hover:text-on-accent`}>
                See a finished case
              </a>
            )}
            <OpenRunLink className={`${BUTTON} border border-foreground hover:bg-foreground hover:text-background`}>
              Run your own
            </OpenRunLink>
          </div>
        </div>

        {featured && output && credit && earliest && (
          <>
            <figure
              aria-label="One finished case, in short"
              // PLAY adds data-play before hydration.
              suppressHydrationWarning
              className="hero-trace rounded-sm border border-line bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>One quote, traced</span>
                <HeroReplay />
              </div>
              <blockquote
                lang={featured.run.language ?? undefined}
                dir="auto"
                className="mt-3 font-serif text-2xl leading-snug italic sm:text-[1.7rem]"
              >
                “{featured.run.quote}”
              </blockquote>

              <dl className="mt-5 grid gap-4 border-t border-line pt-4">
                <div className="hero-step" style={at(AT.credit)}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted">Usually credited to</dt>
                  <dd className="mt-1 font-serif text-2xl">
                    {/* s: no longer taken as right. The line is drawn, so it can be struck in front of the reader. */}
                    <s className="strike no-underline" style={at(AT.strike)}>
                      {credit}
                    </s>
                  </dd>
                </div>
                <div className="hero-step" style={at(AT.origin - 150)}>
                  <dt className="text-xs font-medium uppercase tracking-wider text-muted">Earliest trace found</dt>
                  <dd className="mt-1 font-serif text-2xl text-accent-ink">
                    <span className="sr-only">{earliest.trace}</span>
                    <span aria-hidden="true" className="marker" style={at(AT.marker)}>
                      {Array.from(earliest.trace).map((char, i) => (
                        <span key={i} className="hero-char" style={{ ...at(AT.origin), "--c": i } as CSSProperties}>
                          {char}
                        </span>
                      ))}
                    </span>
                    {earliest.via && <span className="mt-1 block font-sans text-sm text-muted">via {earliest.via}</span>}
                  </dd>
                </div>
              </dl>

              <figcaption className="hero-step mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-line pt-4" style={at(AT.verdict)}>
                <span className="text-sm">
                  <span className={`font-medium uppercase tracking-wider text-xs ${VERDICT_LOOK[output.verdict]}`}>
                    {verdictWords(output.verdict)}
                  </span>
                  <span className="text-muted"> · {output.confidence} confidence</span>
                  <span className="mt-0.5 block font-medium">{HEADLINE[output.verdict](credit)}</span>
                </span>
                <Link
                  href={`/cases/${featured.caseId}`}
                  className="text-sm underline decoration-line underline-offset-4 hover:decoration-foreground"
                >
                  See every step
                </Link>
              </figcaption>
            </figure>
            <script dangerouslySetInnerHTML={{ __html: PLAY }} />
          </>
        )}
      </div>
    </section>
  );
}
