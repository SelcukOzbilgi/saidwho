"use client";

import { type ReactNode, useEffect, useRef } from "react";

// A list whose items come in one at a time as each scrolls into view, those
// seen together a beat apart in reading order, so a phone sees each card arrive
// rather than a grid that finished playing out of sight. The server renders
// every item in place. Only an item still out of the window is set back
// (data-arrive="wait") to come in when it gets there (data-arrive="in", with
// its --wait); one already on screen is left alone, and so is everything under
// reduced motion. The CSS is in the Home: eval and cases block of globals.css.
export function ArriveList({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = [...list.children].filter((el): el is HTMLElement => el instanceof HTMLElement);
    const later = items.filter((el) => el.getBoundingClientRect().top >= window.innerHeight);
    later.forEach((el) => (el.dataset.arrive = "wait"));
    // A little inside the bottom edge, as Reveal does, so a card moves once it can be seen.
    const seen = new IntersectionObserver(
      (entries) => {
        const now = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        now.forEach((el, i) => {
          el.style.setProperty("--wait", `${Math.min(i, 8) * 70}ms`);
          el.dataset.arrive = "in";
          seen.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    later.forEach((el) => seen.observe(el));
    return () => {
      seen.disconnect();
      items.forEach((el) => {
        delete el.dataset.arrive;
        el.style.removeProperty("--wait");
      });
    };
  }, []);

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
