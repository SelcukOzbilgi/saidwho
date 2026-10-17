"use client";

import { type ReactNode, useRef } from "react";

import { useCountUp } from "./count-up";

// A score as a count and a bar on one clock: the first number counts up as the
// bar fills to it, so the figure and the length read as the same amount (the
// rolling number and growing bar of dhxwhy's Bar Race Chart on 21st.dev,
// without the race). The server renders both finished. The real number stays
// in the page for screen readers, find-in-page and translators, whatever the
// digits on screen are doing, so a partial count is never read out. The digits
// keep the width of the final number, so the words after them don't shift.
export function ScoreMeter({
  got,
  of,
  strong = false,
  delay,
  numberClassName,
  children,
}: {
  got: number;
  of: number;
  strong?: boolean;
  // Seconds after it comes into view, so scores seen together go in reading order.
  delay?: number;
  numberClassName?: string;
  // Words between the number and its bar.
  children?: ReactNode;
}) {
  const digits = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  useCountUp(
    digits,
    got,
    (n) => {
      if (digits.current) digits.current.textContent = String(Math.round(n));
      // At the end the bar lets go of its transform and sits as the server drew it.
      if (bar.current) bar.current.style.transform = n >= got ? "" : `scaleX(${n / got})`;
    },
    { delay },
  );

  return (
    <>
      <span className={numberClassName}>
        <span className="sr-only">{got}</span>
        <span
          ref={digits}
          aria-hidden="true"
          className="inline-block text-right tabular-nums"
          style={{ minWidth: `${String(got).length}ch` }}
        >
          {got}
        </span>{" "}
        of {of}
      </span>
      {children}
      {of > 0 && (
        <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
          <span
            ref={bar}
            className={`block h-full origin-left rounded-full ${strong ? "bg-accent" : "bg-foreground/40"}`}
            style={{ width: `${(100 * got) / of}%` }}
          />
        </span>
      )}
    </>
  );
}
