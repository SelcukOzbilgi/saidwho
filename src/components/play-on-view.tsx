"use client";

import { RotateCcw } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";

import { onFirstView } from "./reveal";

// Plays a diagram once, the first time it scrolls into view. The server renders
// it as it ends; only once this runs is one still below the window set back
// (data-run="wait"), to play when it gets there (data-run="play"). One already on
// screen is left alone, and so is everything under reduced motion. The CSS for
// both states sits with the diagram's own rules in globals.css.
export function PlayOnView({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = onFirstView(
      el,
      () => (el.dataset.run = "play"),
      () => (el.dataset.run = "wait"),
    );
    return () => {
      stop?.();
      delete el.dataset.run;
    };
  }, []);

  return (
    <div ref={ref} data-play-root="" className={className} style={style}>
      {children}
    </div>
  );
}

// Plays the diagram it sits in from the top. It shows only where the diagram can
// play (globals.css hides .play-again otherwise), so it never offers what
// reduced motion turns off.
export function PlayAgain() {
  const ref = useRef<HTMLButtonElement>(null);

  const replay = () => {
    const root = ref.current?.closest<HTMLElement>("[data-play-root]");
    if (!root) return;
    // "wait" takes the animations off and sets the start; reading the layout
    // makes the browser drop them, so "play" starts them again from the top.
    root.dataset.run = "wait";
    void root.offsetWidth;
    root.dataset.run = "play";
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={replay}
      className="play-again -my-1 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <RotateCcw aria-hidden="true" className="size-3" />
      Play again
    </button>
  );
}
