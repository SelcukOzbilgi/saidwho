"use client";

import { RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

// Plays the hero's trace again. The button shows only while the trace can play
// (globals.css hides it otherwise), so it never offers what reduced motion turns off.
export function HeroReplay() {
  const ref = useRef<HTMLButtonElement>(null);

  // On a first load the inline script in hero.tsx has set data-play already.
  // Coming back from another page, the script isn't run, so it is set here,
  // before the page is painted.
  useLayoutEffect(() => {
    const trace = ref.current?.closest(".hero-trace");
    if (!trace || trace.hasAttribute("data-play")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    trace.setAttribute("data-play", "");
  }, []);

  const replay = () => {
    const trace = ref.current?.closest<HTMLElement>(".hero-trace");
    if (!trace) return;
    trace.removeAttribute("data-play");
    // Reading the layout makes the browser drop the finished animations, so setting the attribute again starts them over.
    void trace.offsetWidth;
    trace.setAttribute("data-play", "");
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={replay}
      className="hero-replay -my-1 items-center gap-1 rounded-full px-2 py-1 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
    >
      <RotateCcw aria-hidden="true" className="size-3" />
      Play again
    </button>
  );
}
