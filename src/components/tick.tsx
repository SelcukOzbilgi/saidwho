"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { type ReactNode, type Ref, useState } from "react";

import { EASE_OUT } from "./case-motion";

// A count that rolls to its new value as a run reports it: each place whose
// digit changes swaps, the new digit rising in as the old one lifts away, and
// rolling the other way when the count goes down, as it does when a replay is
// dragged back. Only the places that change move. Adapted from the rolling
// count in kuratlielia's Timeline and unlumen's Animate Digits on 21st.dev,
// without their blur.
//
// The value is plain text in the page, one character per place, so it reads
// the same without JavaScript and to a screen reader; only the digit on its way
// out is hidden from them. Under reduced motion the digits swap at once.

const amount = (text: string): number => Number.parseFloat(text.replace(/[^\d.]/g, "")) || 0;

export function Tick({ value }: { value: number | string }) {
  const text = String(value);
  const moves = useReducedMotion() !== true;
  // Which way the last change went, worked out while rendering so the new
  // digits and the leaving ones agree on it.
  const [last, setLast] = useState({ text, up: true });
  if (last.text !== text) setLast({ text, up: amount(text) >= amount(last.text) });
  const chars = [...text];

  return (
    <span className="inline-flex tabular-nums">
      {chars.map((char, i) => (
        // Keyed by place from the right, so a count going from 9 to 10 keeps its units.
        <span key={chars.length - i} className="relative inline-block">
          <AnimatePresence initial={false} mode="popLayout" custom={last.up}>
            <Digit key={char} up={last.up} moves={moves}>
              {char}
            </Digit>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

// The variants take the direction from AnimatePresence's custom value, so a
// digit already on its way out leaves the way the latest change went.
const ROLL: Variants = {
  from: (up: boolean) => ({ opacity: 0, y: up ? "0.4em" : "-0.4em" }),
  shown: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
  gone: (up: boolean) => ({ opacity: 0, y: up ? "-0.3em" : "0.3em", transition: { duration: 0.14, ease: "easeOut" } }),
  cut: { opacity: 0, transition: { duration: 0 } },
};

// The ref lets AnimatePresence lift a leaving digit out of the line (popLayout),
// so the new one takes its place at once instead of waiting beside it.
function Digit({ up, moves, ref, children }: { up: boolean; moves: boolean; ref?: Ref<HTMLSpanElement>; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.span
      ref={ref}
      aria-hidden={present ? undefined : true}
      className="inline-block"
      custom={up}
      variants={ROLL}
      initial={moves ? "from" : false}
      animate="shown"
      exit={moves ? "gone" : "cut"}
    >
      {children}
    </motion.span>
  );
}
