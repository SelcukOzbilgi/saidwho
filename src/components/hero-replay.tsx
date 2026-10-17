"use client";

import { RotateCcw } from "lucide-react";
import { useRef } from "react";

// Plays the hero's trace again. The button shows only where the trace plays
// (globals.css hides it otherwise), so it never offers what reduced motion turns off.
export function HeroReplay() {
  const ref = useRef<HTMLButtonElement>(null);

  const replay = () => {
    const trace = ref.current?.closest<HTMLElement>(".hero-trace");
    if (!trace) return;
    // hero-rewind takes the animations off. Reading the layout makes the browser
    // drop them, so taking the class off again starts them from the top.
    trace.classList.add("hero-rewind");
    void trace.offsetWidth;
    trace.classList.remove("hero-rewind");
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={replay}
      className="hero-replay -my-1 shrink-0 items-center whitespace-nowrap gap-1 rounded-full px-2 py-1 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-ink"
    >
      <RotateCcw aria-hidden="true" className="size-3" />
      Play again
    </button>
  );
}
