"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { onFirstView } from "./reveal";

// Plays the home page's featured case in parts, once, as it scrolls into view.
// Each part is marked data-act; a cue says how long after the part before it a
// part may start. A part also waits until it is itself in the window: on a
// phone the trail and the cost row sit a screen or more below the verdict, and
// a slow scroll would otherwise play them where nobody sees them. As with
// Reveal, the server renders every part finished, and nothing is set back when
// the section is already on screen at load, motion is reduced or the browser
// can't tell. The CSS is in the Home: featured case block of globals.css.

export type Act = "verdict" | "trail" | "footer";
export type Cue = { act: Act; gap: number };
export type Plan = { wide: Cue[]; narrow: Cue[] };

// Tailwind's lg, where the verdict and the trail sit side by side.
const WIDE = "(min-width: 64rem)";

export function FeaturedPlay({ plan, children }: { plan: Plan; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parts = [...el.querySelectorAll<HTMLElement>("[data-act]")];
    const part = (act: Act) => parts.find((p) => p.dataset.act === act);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watch: IntersectionObserver | undefined;

    const stop = onFirstView(
      el,
      () => {
        const cues = (window.matchMedia(WIDE).matches ? plan.wide : plan.narrow).filter((c) => part(c.act));
        const seen = new Set<Element>();
        let next = 0;
        let last = performance.now();
        // Starts the next part once its gap is up and it has been seen, then
        // checks the one after; the timer or the observer calls it again.
        const play = () => {
          clearTimeout(timer);
          const cue = cues[next];
          if (!cue) return watch?.disconnect();
          const left = last + cue.gap - performance.now();
          if (left > 0) {
            timer = setTimeout(play, left);
            return;
          }
          const p = part(cue.act)!;
          if (!seen.has(p)) return;
          p.dataset.reveal = "in";
          last = performance.now();
          next += 1;
          play();
        };
        // The same edge as Reveal's, a little inside the bottom of the window.
        watch = new IntersectionObserver(
          (entries) => {
            for (const e of entries) if (e.isIntersecting) seen.add(e.target);
            play();
          },
          { rootMargin: "0px 0px -8% 0px" },
        );
        for (const p of parts) watch.observe(p);
        play();
      },
      () => parts.forEach((p) => (p.dataset.reveal = "wait")),
    );

    return () => {
      stop?.();
      watch?.disconnect();
      clearTimeout(timer);
      for (const p of parts) delete p.dataset.reveal;
    };
  }, [plan]);

  return <div ref={ref}>{children}</div>;
}
