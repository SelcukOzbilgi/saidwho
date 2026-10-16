"use client";

import { type ReactNode, useEffect, useRef } from "react";

// Parts of the home page ease in once, as they scroll into view. The server
// renders everything in its final place, so the page reads the same without
// JavaScript. Only once this runs is a part that is still out of the window
// set back (data-reveal="wait"), to come in when it gets there
// (data-reveal="in"). A part already on screen is left alone, and so is
// everything under reduced motion. The CSS for both states is in the Home block
// of globals.css: children marked reveal-up, reveal-pop, reveal-draw-y or
// reveal-draw-x move, one after another in the order of their --i.

// Runs onView the first time el comes into the window, after calling setBack
// so it can put el in its starting state. Does nothing, and returns undefined,
// when el is already in view, motion is reduced or the browser can't tell.
export function onFirstView(el: Element, onView: () => void, setBack?: () => void): (() => void) | undefined {
  if (typeof IntersectionObserver === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const box = el.getBoundingClientRect();
  if (box.top < window.innerHeight && box.bottom > 0) return;
  setBack?.();
  // A little inside the bottom edge, so a part starts moving once it can be seen.
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      onView();
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  observer.observe(el);
  return () => observer.disconnect();
}

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = onFirstView(
      el,
      () => (el.dataset.reveal = "in"),
      () => (el.dataset.reveal = "wait"),
    );
    return () => {
      stop?.();
      delete el.dataset.reveal;
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
