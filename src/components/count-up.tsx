"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";

import { onFirstView } from "./reveal";

// A whole number that counts up from zero the first time it scrolls into view,
// so the score reads as an amount. The server renders the number itself, which
// is what shows without JavaScript, with reduced motion, or when it is already
// on screen as the page opens.
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let counting: ReturnType<typeof animate> | undefined;
    const show = (n: number) => (el.textContent = String(Math.round(n)));
    const stop = onFirstView(
      el,
      () => (counting = animate(0, value, { duration: 0.9, ease: "easeOut", onUpdate: show })),
      () => show(0),
    );
    return () => {
      stop?.();
      counting?.stop();
      show(value);
    };
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      {value}
    </span>
  );
}
