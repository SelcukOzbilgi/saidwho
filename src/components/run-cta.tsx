import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Reveal } from "./reveal";
import { RUN_PAGE } from "./sections";

// The last section of the home page, before the footer: after the cases, the
// next thing to do is run a quote of one's own. One line, one button, on a card
// like the featured case's, so the page opens and closes on the same shape.
export function RunCta() {
  return (
    <section aria-labelledby="run-cta-title" className="rounded-sm border border-line bg-card p-6 shadow-sm sm:p-10 lg:p-12">
      <Reveal className="grid items-end gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* The question gets the card's full width, so it stays on one line on a wide screen. */}
        <div className="lg:col-span-2">
          <p className="reveal-up text-sm text-muted">Your turn</p>
          <h2
            id="run-cta-title"
            className="reveal-up mt-2 font-serif text-3xl leading-tight font-semibold tracking-tight sm:text-5xl"
            style={{ "--i": 1 } as CSSProperties}
          >
            Seen a quote you&apos;re <span className="marker reveal-marker">not sure about</span>?
          </h2>
        </div>
        <p className="reveal-up max-w-2xl leading-7 text-muted sm:text-lg sm:leading-8" style={{ "--i": 2 } as CSSProperties}>
          Paste it in and watch the agents look for where it first appeared, the way they did for the cases above, with
          a link for every page they read.
        </p>
        <Link
          href={RUN_PAGE.href}
          className="reveal-up group mt-4 inline-flex items-center gap-2 self-end justify-self-start rounded-sm lg:mt-0 bg-foreground px-6 py-3.5 text-lg font-medium text-background transition-colors hover:bg-accent hover:text-on-accent"
          style={{ "--i": 3 } as CSSProperties}
        >
          Run your own quote
          <ArrowRight aria-hidden="true" className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
        </Link>
      </Reveal>
    </section>
  );
}
