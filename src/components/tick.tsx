"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion, type Variants } from "motion/react";
import { type Ref, useState } from "react";

import { EASE_OUT } from "./case-motion";

// A count that rolls to its new value as a run reports it: each place whose
// digit changes swaps, the new digit rising in as the old one lifts away, and
// rolling the other way when the count goes down, as it does when a replay is
// dragged back. Only the places that change move. Adapted from the rolling
// count in kuratlielia's Timeline and unlumen's Animate Digits on 21st.dev,
// without their blur.
//
// The value sits in the page once as plain text, kept out of sight, so a screen
// reader, a copy and innerText all get "16" in one piece. The rolling digits are
// drawn from a data attribute through ::before, hidden from assistive tech, so
// they add no text of their own. Find in page matches the hidden copy but has
// nothing visible to highlight. Under reduced motion the digits swap at once.

const amount = (text: string): number => Number.parseFloat(text.replace(/[^\d.]/g, "")) || 0;

type Roll = { up: boolean; quick: boolean };

export function Tick({ value }: { value: number | string }) {
  const text = String(value);
  const moves = useReducedMotion() !== true;
  // Which way the last change went, worked out while rendering so the new
  // digits and the leaving ones agree on it.
  const [last, setLast] = useState({ text, up: true });
  if (last.text !== text) setLast({ text, up: amount(text) >= amount(last.text) });
  const chars = [...text];

  return (
    <span className="tabular-nums">
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-block whitespace-nowrap select-none">
        {chars.map((char, i) => (
          // Keyed by place from the right, so a count going from 9 to 10 keeps its units.
          <Place key={chars.length - i} char={char} up={last.up} moves={moves} />
        ))}
      </span>
    </span>
  );
}

// One place of the count. A place that changes again while its last digit is
// still leaving (a scrub, or a burst of events from a live run) swaps at once,
// so leaving digits never pile up on top of each other.
function Place({ char, up, moves }: { char: string; up: boolean; moves: boolean }) {
  const [seen, setSeen] = useState({ char, leaving: false, quick: false });
  if (seen.char !== char) setSeen({ char, leaving: true, quick: seen.leaving });
  const roll: Roll = { up, quick: seen.quick || !moves };
  return (
    <span className="relative inline-block">
      <AnimatePresence
        initial={false}
        mode="popLayout"
        custom={roll}
        onExitComplete={() => setSeen((now) => ({ ...now, leaving: false, quick: false }))}
      >
        <Digit key={char} char={char} roll={roll} />
      </AnimatePresence>
    </span>
  );
}

// The variants take the roll from AnimatePresence's custom value, so a digit
// leaving goes the way the latest change went, or at once in a burst.
const ROLL: Variants = {
  from: ({ up, quick }: Roll) => (quick ? { opacity: 1, y: 0 } : { opacity: 0, y: up ? "0.4em" : "-0.4em" }),
  shown: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
  gone: ({ up, quick }: Roll) =>
    quick
      ? { opacity: 0, transition: { duration: 0 } }
      : { opacity: 0, y: up ? "-0.3em" : "0.3em", transition: { duration: 0.14, ease: "easeOut" } },
};

// The ref lets AnimatePresence lift a leaving digit out of the line (popLayout),
// so the new one takes its place at once instead of waiting beside it. The
// digit is drawn from data-char, so the page text holds only the plain copy.
function Digit({ char, roll, ref }: { char: string; roll: Roll; ref?: Ref<HTMLSpanElement> }) {
  const present = useIsPresent();
  return (
    <motion.span
      ref={ref}
      data-char={char}
      data-leaving={present ? undefined : ""}
      className="inline-block before:content-[attr(data-char)]"
      custom={roll}
      variants={ROLL}
      initial="from"
      animate="shown"
      exit="gone"
    />
  );
}
