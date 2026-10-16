"use client";

import { type ReactNode, useEffect, useRef } from "react";

// "Run your own" is a tab with a sheet under it, at the bottom of the home
// page. Asked for, from the header, a button that links to #run, or a link
// that opens the page on #run, the sheet folds up behind its tab and unfolds
// once it is in view, then puts the cursor in the quote field. Scrolled to, it
// is just open: someone reading down the page didn't ask to type yet. Without
// JavaScript, or with reduced motion, it never folds.

// The header sends this when its "Run your own" link is clicked.
export const OPEN_RUN = "saidwho:open-run";

// A link to the sheet that asks it to open. The hash alone isn't enough: when
// the address already ends in #run, clicking it again fires no hashchange.
export function OpenRunLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a href="#run" onClick={() => window.dispatchEvent(new Event(OPEN_RUN))} className={className}>
      {children}
    </a>
  );
}

// How long the unfold takes, with its delay, so the cursor still lands if the
// browser never reports the animation's end, and when the last row is in.
const UNFOLD_MS = 700;
const ROWS_MS = 1_200;
// If the sheet never reports coming into view, it opens anyway after this long,
// so a folded sheet can't be left behind its tab.
const WAIT_MS = 3_000;

export function RunSheet({ tab, intro, children }: { tab: ReactNode; intro?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sheet = ref.current;
    if (!sheet) return;
    const panel = sheet.querySelector<HTMLElement>(".run-panel");
    let observer: IntersectionObserver | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => timers.splice(0).forEach(clearTimeout);
    let lastAsked = -Infinity;

    const focusQuote = () => sheet.querySelector<HTMLTextAreaElement>("textarea:not(:disabled)")?.focus({ preventScroll: true });
    const onEnd = (event: AnimationEvent) => {
      if (event.target === panel && event.animationName === "run-unfold") focusQuote();
    };
    const play = () => {
      observer?.disconnect();
      clearTimers();
      sheet.dataset.open = "play";
      timers.push(
        setTimeout(focusQuote, UNFOLD_MS),
        setTimeout(() => delete sheet.dataset.open, ROWS_MS),
      );
    };
    const open = () => {
      // A click on a #run link sends the event and changes the hash: one opening, not two.
      const now = Date.now();
      if (now - lastAsked < 800) return;
      lastAsked = now;
      observer?.disconnect();
      clearTimers();
      // Without the unfold the cursor goes straight in, a moment after the click,
      // since following the #run link itself would take the focus back.
      if (!panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        timers.push(setTimeout(focusQuote, 50));
        return;
      }
      sheet.dataset.open = "wait";
      // The page may still be gliding down to the sheet; it opens once its top is well in view.
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) play();
        },
        { rootMargin: "0px 0px -30% 0px" },
      );
      observer.observe(sheet);
      timers.push(setTimeout(play, WAIT_MS));
    };
    const onHash = () => {
      if (window.location.hash === "#run") open();
    };

    panel?.addEventListener("animationend", onEnd);
    window.addEventListener(OPEN_RUN, open);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => {
      panel?.removeEventListener("animationend", onEnd);
      window.removeEventListener(OPEN_RUN, open);
      window.removeEventListener("hashchange", onHash);
      observer?.disconnect();
      clearTimers();
      delete sheet.dataset.open;
    };
  }, []);

  return (
    <div ref={ref} className="run-sheet">
      {/* The tab sits on the sheet's top edge and covers it, so the two read as one piece of paper. */}
      <div className="run-tab relative z-10 -mb-px inline-block rounded-t-sm border border-b-0 border-line bg-card px-5 pt-3 pb-2.5 sm:px-6">
        {tab}
      </div>
      <div className="run-panel rounded-sm rounded-tl-none border border-line bg-card p-5 shadow-sm sm:p-7">
        {intro && <p className="run-row mb-6 max-w-2xl text-muted">{intro}</p>}
        {children}
      </div>
    </div>
  );
}
