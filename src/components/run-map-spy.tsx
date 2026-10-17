"use client";

import { useEffect, useRef } from "react";

// On a wide screen the run map stays in view next to the list of steps; this
// marks the step being read there: the last one whose top has come up to the
// top the map sticks at, which is where a jump from the map's link puts it.
// The step's link gets aria-current="step", and one tint (.hiw-mark) glides to
// its row, so the mark moves from step to step instead of blinking. Below the lg width the
// map sits above the list, so nothing is marked. globals.css keeps the mark off
// while the map plays, since then the orange ring shows the step the run is on.
const WIDE = "(min-width: 64rem)";
// How far below that top a step may start and still count as come up to it,
// so a heading arriving there is taken as the one being read.
const REACH = 48;

export function RunMapSpy() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const map = ref.current?.closest<HTMLElement>("[data-play-root]");
    const tint = map?.querySelector<HTMLElement>(".hiw-mark");
    const box = tint?.parentElement;
    if (!map || !tint || !box) return;
    const links = [...map.querySelectorAll<HTMLAnchorElement>('a[href^="#how-"]')];
    const steps = links.map((link) => document.getElementById(link.hash.slice(1)));
    const media = window.matchMedia(WIDE);
    // What sticks is the box around the map, and only from the lg width up, so
    // it is looked for once the screen is wide. Its top is used, not the map's
    // place on screen: the map is taller than the last step, so it has already
    // scrolled up by the time that step reaches the top.
    let holder: HTMLElement | null = null;
    const stickyTop = () => {
      for (let el: HTMLElement | null = holder ?? map; el && !holder; el = el.parentElement) {
        if (getComputedStyle(el).position === "sticky") holder = el;
      }
      const top = holder ? parseFloat(getComputedStyle(holder).top) : NaN;
      return Number.isFinite(top) ? top : map.getBoundingClientRect().top;
    };
    let frame = 0;
    let current = -1;

    // The tint covers the step's whole row, its thrown-out or rounds line included.
    const place = (index: number) => {
      const row = (links[index].closest("li") ?? links[index]).getBoundingClientRect();
      const origin = box.getBoundingClientRect();
      tint.style.setProperty("--mark-x", `${row.left - origin.left}px`);
      tint.style.setProperty("--mark-y", `${row.top - origin.top}px`);
      tint.style.setProperty("--mark-w", `${row.width}px`);
      tint.style.setProperty("--mark-h", `${row.height}px`);
    };
    const mark = (index: number) => {
      if (index >= 0) {
        place(index);
        // Turned on in place: the glide is only for moving from one step to the next.
        if (!tint.hasAttribute("data-on")) {
          tint.getBoundingClientRect();
          tint.setAttribute("data-on", "");
        }
      } else tint.removeAttribute("data-on");
      if (index === current) return;
      current = index;
      map.toggleAttribute("data-reading", index >= 0);
      links.forEach((link, i) => (i === index ? link.setAttribute("aria-current", "step") : link.removeAttribute("aria-current")));
    };
    const measure = () => {
      frame = 0;
      if (!media.matches) return mark(-1);
      const line = stickyTop() + REACH;
      // Past the end of the list, nothing is being read there any more.
      const last = steps.at(-1)?.getBoundingClientRect();
      if (!last || last.bottom < line) return mark(-1);
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
