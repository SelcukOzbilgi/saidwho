"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// The motion a run view uses, in one place. The rule throughout: what is on the
// page when it first renders shows as it is, so a finished run reads without
// JavaScript and doesn't replay its own entrance; only what a replay or a live
// run adds afterwards moves in. Under reduced motion nothing moves.

// Quick out, slow settle: things arrive fast and don't bounce.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const moving = (reduced: boolean | null) => reduced !== true;

// Children present when this first renders are shown as they are; children added
// later enter. Nothing gets an exit: when a replay starts over, what it clears
// should go at once, not fade out over the first new events.
export function Arrivals({ children }: { children: ReactNode }) {
  return <AnimatePresence initial={false}>{children}</AnimatePresence>;
}

type EnterProps = {
  as?: "div" | "li" | "section";
  // Glide to a new place when cards before it come or go, instead of jumping.
  layout?: boolean;
  delay?: number;
  // How far below its place it starts, in px.
  rise?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
  "aria-label"?: string;
  children: ReactNode;
};

const TAGS = { div: motion.div, li: motion.li, section: motion.section } as const;

// Fades and rises into place when it mounts after the view has rendered.
export function Enter({ as = "div", layout = false, delay = 0, rise = 8, children, ...rest }: EnterProps) {
  const moves = moving(useReducedMotion());
  const Tag = TAGS[as] as typeof motion.div;
  return (
    <Tag
      layout={moves && layout ? "position" : false}
      initial={moves ? { opacity: 0, y: rise } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay, layout: { duration: 0.35, ease: EASE_OUT } }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// The verdict's word, pressed on like a stamp: it lands a little large, dips
// just past its size and settles. Only when the verdict arrives during a run.
const STAMP_FROM = { opacity: 0, scale: 1.4, rotate: -4 };
const STAMP_TO = { opacity: 1, scale: 1, rotate: 0 };
// An overshooting curve gives the dip without keyframes.
const STAMP_TIMING = { duration: 0.36, ease: [0.3, 1.35, 0.55, 1], delay: 0.15, opacity: { duration: 0.12, delay: 0.15 } } as const;

export function Stamp({ className, children }: { className: string; children: ReactNode }) {
  const moves = moving(useReducedMotion());
  return (
    <motion.span
      className={`inline-block ${className}`}
      initial={moves ? STAMP_FROM : false}
      animate={STAMP_TO}
      transition={STAMP_TIMING}
    >
      {children}
    </motion.span>
  );
}

const noSubscribe = () => () => {};

// Reveals a diagram as it scrolls into view, through the data-reveal attribute
// and the Case block in globals.css. The server's markup is the finished state.
// A diagram already on screen as the page loads is left alone, since hiding it
// to show it again would flash; one further down starts hidden and plays once it
// is seen. One a run adds does the same when playFresh is set; otherwise its
// parts animate in on their own as they arrive.
//
// A short diagram plays as a whole. A long one ("each") shows its .reveal-item
// parts as each scrolls into view, those seen together a beat apart in order.
export function useReveal<T extends HTMLElement>({ playFresh = true, each = false } = {}) {
  const ref = useRef<T>(null);
  // False while hydrating the server's markup, true for anything mounted later.
  const live = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const [fresh] = useState(live);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (fresh ? !playFresh : el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.reveal = "armed";
    const seen = new IntersectionObserver(
      (entries) => {
        if (!each) {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          el.dataset.reveal = "shown";
          seen.disconnect();
          return;
        }
        const now = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target as HTMLElement);
        now.forEach((item, i) => {
          item.style.setProperty("--wait", `${Math.min(i, 8) * 50}ms`);
          item.dataset.seen = "";
          seen.unobserve(item);
        });
      },
      { threshold: 0.1 },
    );
    if (each) el.querySelectorAll(".reveal-item").forEach((item) => seen.observe(item));
    else seen.observe(el);
    return () => seen.disconnect();
  }, [fresh, playFresh, each]);

  return ref;
}

// A list whose parts reveal in order as they come into view.
export function RevealList({
  as = "ol",
  playFresh = true,
  each = false,
  className,
  children,
}: {
  as?: "ol" | "ul";
  playFresh?: boolean;
  each?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useReveal<HTMLOListElement>({ playFresh, each });
  const Tag = as;
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
