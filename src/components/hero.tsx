import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { ExampleCase } from "../cases/cases";
import { verdictWords } from "../lib/run-state";
import styles from "./hero.module.css";
import { HeroReplay } from "./hero-replay";
import { Wordmark } from "./logo-mark";
import { RUN_PAGE } from "./sections";
import { earliestTrace, VERDICT_LOOK } from "./verdict-card";

// The first screen: the name, then the featured case told as a headline. The
// quote is set large, the name it is shared under is struck out where the run
// found it wrong, and the earliest trace the run found is written in and
// marked. All of it comes from the saved run, so it says what the case page
// says. Under it, what the app does and the two ways in.

const BUTTON = "inline-flex items-center gap-2 rounded-sm px-4 py-3 text-[0.8125rem] font-medium transition-colors";

// What the case needs from the featured case; without all three the hero is
// the name and the copy, and the featured section below gives the quote itself.
export function heroTrace(featured: ExampleCase | undefined) {
  const output = featured?.run.verdict?.output;
  const credit = featured?.run.popularAttribution;
  const earliest = output && featured ? earliestTrace(output, featured.run.nodes) : null;
  return output && credit && earliest ? { output, credit, earliest } : null;
}

export function Hero({ featured }: { featured: ExampleCase | undefined }) {
  const trace = heroTrace(featured);

  return (
    <section
      aria-labelledby="hero-title"
      // The first screen is the hero alone: it fills the window under the header,
      // with its content in the middle, so the space above it matches the space
      // below and the next section only shows after a scroll. On a phone the hero
      // is taller than the window, so the gap below it is the page's usual one.
      // The hero errs a pixel taller rather than letting the next section's top
      // edge into the window: HeaderHeight measures in whole pixels (a 66.8px
      // header is 67), and until it runs the fallback is a little under the
      // header's height.
      className="flex min-h-[calc(100svh-var(--site-header-height,3.25rem)+1px)] flex-col justify-center pt-10 pb-(--section-gap) sm:min-h-[calc(100svh-var(--site-header-height,4rem)+1px)] sm:py-12"
    >
      <h1 id="hero-title" className="font-serif text-[clamp(4rem,8vw,8rem)] leading-[0.95] font-semibold tracking-tight">
        <Wordmark />
      </h1>

      <div className="mt-6 sm:mt-7">
        {featured && trace && (
          <figure
            aria-label="One quote, traced"
            // hero-trace: HeroReplay plays it again, and globals.css keeps it still
            // under reduced motion. hero.module.css plays it.
            className={`hero-trace ${styles.case}`}
          >
            <div className={styles.overline}>
              <span>One quote, traced</span>
              <HeroReplay />
            </div>

            <blockquote lang={featured.run.language ?? undefined} dir="auto" className={`${styles.quote} font-serif italic`}>
              “{featured.run.quote}”
            </blockquote>

            <dl className={styles.correction}>
              <div className={styles.credit}>
                <dt className={styles.label}>Usually credited to</dt>
                <dd className="font-serif">
                  {/* s: no longer taken as right. Only when the run says the name is wrong. */}
                  {trace.output.verdict === "misattributed" ? (
                    <s className={`strike no-underline ${styles.strike}`}>{trace.credit}</s>
                  ) : (
                    trace.credit
                  )}
                </dd>
              </div>
              <div className={styles.origin}>
                <dt className={styles.label}>Earliest trace found</dt>
                <dd>
                  <span className="font-serif text-accent-ink">
                    <span className="sr-only">{trace.earliest.trace}</span>
                    <span aria-hidden="true" className={`marker ${styles.marker}`}>
                      {Array.from(trace.earliest.trace).map((char, i) => (
                        <span key={i} className={styles.char} style={{ "--c": i } as CSSProperties}>
                          {char}
                        </span>
                      ))}
                    </span>
                  </span>
                  {trace.earliest.via && <span className={styles.via}>via {trace.earliest.via}</span>}
                </dd>
              </div>
            </dl>

            <figcaption className={styles.verdict}>
              <p>
                <span className={`${styles.verdictWord} ${VERDICT_LOOK[trace.output.verdict]}`}>
                  {verdictWords(trace.output.verdict)}
                </span>
                <span className="text-muted"> · {trace.output.confidence} confidence</span>
              </p>
              <Link href={`/cases/${featured.caseId}`} className={styles.caseLink}>
                See every step <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </figcaption>
          </figure>
        )}

        {/* What it does on the left, the two ways in on the right; one column on a phone. */}
        <div className="mt-6 grid gap-3 border-t border-line pt-6 sm:mt-7 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-x-16 md:gap-y-0">
          <p className="max-w-[35rem] leading-[1.7] md:row-span-2">
            Ask a chatbot where a quote comes from and it will often guess a source. Said Who? goes and finds the pages
            and their dates, and a check written in plain code, not AI, throws out any snippet it can&apos;t find on the
            page.
          </p>
          <p className="max-w-xl text-[0.9375rem] leading-[1.65] text-muted">
            Paste a quote you saw online and find out where it first appeared, with a link for every step.
          </p>
          <div className="mt-1 flex flex-wrap gap-3 md:mt-4">
            {featured && (
              <a href="#featured" className={`${BUTTON} bg-foreground text-background hover:bg-accent hover:text-on-accent`}>
                See a finished case
              </a>
            )}
            <Link
              href={RUN_PAGE.href}
              className={`${BUTTON} border border-foreground hover:bg-foreground hover:text-background`}
            >
              {RUN_PAGE.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
