"use client";

import { animate } from "motion/react";
import { type RefObject, useEffect, useRef } from "react";

import { onFirstView } from "./reveal";

// Counts from zero up to value the first time el scrolls into view, handing
// each step to show, so a score reads as an amount. The server renders the
// finished state, which is what stays without JavaScript, with reduced motion,
// or when el is already on screen as the page opens. Motion's easeOut is the
// same curve as CSS ease-out, so whatever show moves keeps pace with the count.
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  value: number,
  show: (n: number) => void,
  { delay = 0, duration = 0.9 }: { delay?: number; duration?: number } = {},
) {
  // show is read when it runs, so a new function each render doesn't restart the count.
  const step = useRef(show);
  useEffect(() => {
    step.current = show;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let counting: ReturnType<typeof animate> | undefined;
    const stop = onFirstView(
      el,
      () => (counting = animate(0, value, { delay, duration, ease: "easeOut", onUpdate: (n) => step.current(n) })),
      () => step.current(0),
    );
    return () => {
      stop?.();
      counting?.stop();
      step.current(value);
    };
  }, [ref, value, delay, duration]);
}
