"use client";

import { useEffect, useRef } from "react";

// On a wide screen the run map stays in view next to the list of steps; this
// marks the step being read there (aria-current="step" on its link), the last
// one whose top has passed two fifths of the way down the window. Below the lg
// width the map sits above the list, so nothing is marked. A mark, not motion:
// it changes as the reader scrolls and stays put when they stop.
const WIDE = "(min-width: 64rem)";

export function RunMapSpy() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const map = ref.current?.closest("[data-play-root]");
    if (!map) return;
    const links = [...map.querySelectorAll<HTMLAnchorElement>('a[href^="#how-"]')];
    const steps = links.map((link) => document.getElementById(link.hash.slice(1)));
    const media = window.matchMedia(WIDE);
    let frame = 0;
    let current = -1;

    const mark = (index: number) => {
      if (index === current) return;
      current = index;
      links.forEach((link, i) => (i === index ? link.setAttribute("aria-current", "step") : link.removeAttribute("aria-current")));
    };
    const measure = () => {
      frame = 0;
      if (!media.matches) return mark(-1);
      const line = window.innerHeight * 0.4;
      const last = steps.at(-1)?.getBoundingClientRect();
      // Past the end of the list, nothing is being read there any more.
      if (!last || last.bottom < line * 0.5) return mark(-1);
      let index = -1;
      steps.forEach((step, i) => {
        if (step && step.getBoundingClientRect().top <= line) index = i;
      });
      mark(index);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    media.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      media.removeEventListener("change", schedule);
      mark(-1);
    };
  }, []);

  return <span ref={ref} hidden />;
}
