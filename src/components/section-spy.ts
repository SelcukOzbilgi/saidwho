"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SECTIONS, type SectionId } from "./sections";

// The section a reader is in: the last one whose top has passed the reading
// line. Above the first one (the intro and the featured case) it's none. At the
// bottom of the page the last section wins, since a short last section may
// never reach the line.
export function pickSection<T extends string>(tops: { id: T; top: number }[], line: number, atEnd: boolean): T | null {
  if (atEnd && tops.length > 0) return tops[tops.length - 1].id;
  let current: T | null = null;
  for (const { id, top } of tops) if (top <= line) current = id;
  return current;
}

// After a click in the nav the page glides past the sections in between; the
// mark goes straight to the one clicked and waits there until the page
// arrives, the reader scrolls on their own, or a second has passed.
const HOLD_MS = 1200;

// Which home page section is in view, measured once a frame while the page
// scrolls. Adapted from the useScrollSpy hook in ddoemonn's Scroll Spy on
// 21st.dev, without its own click-to-scroll: the links stay plain anchors.
export function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<SectionId | null>(null);
  const held = useRef<SectionId | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remeasure = useRef(() => {});

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const release = () => {
      held.current = null;
      clearTimeout(holdTimer.current);
    };
    const measure = () => {
      frame = 0;
      const header = document.querySelector("body > header");
      // A section counts once its top is a third of the way down the part of the window below the header.
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      const line = headerBottom + (window.innerHeight - headerBottom) / 3;
      const tops = SECTIONS.flatMap(({ id }) => {
        const node = document.getElementById(id);
        return node ? [{ id, top: node.getBoundingClientRect().top }] : [];
      });
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      const next = pickSection(tops, line, atEnd);
      if (held.current) {
        if (held.current === next) release();
        return;
      }
      setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // Scrolling by hand takes over from a held mark.
    const takeOver = () => {
      if (held.current) {
        release();
        schedule();
      }
    };
    remeasure.current = schedule;
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", takeOver, { passive: true });
    window.addEventListener("touchstart", takeOver, { passive: true });
    window.addEventListener("keydown", takeOver);
    return () => {
      cancelAnimationFrame(frame);
      release();
      remeasure.current = () => {};
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", takeOver);
      window.removeEventListener("touchstart", takeOver);
      window.removeEventListener("keydown", takeOver);
    };
  }, [enabled]);

  // Called when a nav link is clicked, before the browser starts the jump.
  const follow = useCallback((id: SectionId) => {
    held.current = id;
    setActive(id);
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = null;
      remeasure.current();
    }, HOLD_MS);
  }, []);

  return { active: enabled ? active : null, follow };
}
