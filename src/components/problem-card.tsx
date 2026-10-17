"use client";

import { ArrowRight, CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { Problem, ProblemAction } from "../lib/run-problem";
import { cn } from "../lib/utils";
import { Pop } from "./case-motion";
import { FOCUS_RING } from "./focus-ring";

const LABELS: Record<ProblemAction, string> = {
  fix_nebius: "Fix the Nebius key",
  fix_tavily: "Fix the Tavily key",
  retry: "Try again",
  own_keys: "Use my own keys",
  edit: "Change the quote",
  cases: "Open a finished case",
};

const BUTTON = `inline-flex items-center gap-1.5 rounded-sm px-3.5 py-2 text-sm font-medium transition-colors ${FOCUS_RING}`;
const FIRST = `${BUTTON} bg-foreground text-background hover:bg-accent hover:text-on-accent`;
const OTHER = `${BUTTON} border border-line hover:border-foreground/40 hover:bg-foreground/5`;

// What went wrong with a run and what to do about it: the icon, title, line
// and action row of sean0205's Alert with actions on 21st.dev. A rule down
// its edge draws in when it arrives, in the problem's color (globals.css).
// The first way forward is the one most likely to fix it.
export function ProblemCard({
  ref,
  problem,
  eyebrow,
  onAction,
  busy = null,
}: {
  ref?: React.Ref<HTMLElement>;
  problem: Problem;
  // A word or two over the title: "Ended early", "The run didn't start".
  eyebrow: string;
  onAction: (action: ProblemAction) => void;
  // A way forward that is under way. "Try again" checks the keys first, which
  // can take a few seconds, so its button says so and can't be pressed twice.
  busy?: ProblemAction | null;
}) {
  const id = useId();
  const bad = problem.tone === "bad";
  const Icon = bad ? CircleAlert : TriangleAlert;
  return (
    <section
      ref={ref}
      role="alert"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-text`}
      data-tone={problem.tone}
      className="problem-card relative overflow-hidden rounded-sm border border-line bg-card p-5 pl-6 shadow-sm sm:p-6 sm:pl-7"
    >
      <span aria-hidden="true" className={cn("problem-rule absolute inset-y-0 left-0 w-[3px]", bad ? "bg-bad" : "bg-warn")} />
      <div className="flex gap-3.5">
        <Pop className={cn("mt-0.5 shrink-0", bad ? "text-bad" : "text-warn")}>
          <Icon aria-hidden="true" className="size-5" />
        </Pop>
        <div className="min-w-0">
          <p className={cn("text-xs font-medium tracking-wider uppercase", bad ? "text-bad" : "text-warn")}>{eyebrow}</p>
          <h2 id={`${id}-title`} className="mt-1 font-serif text-2xl leading-tight font-semibold">
            {problem.title}
          </h2>
          <p id={`${id}-text`} className="mt-2 max-w-prose leading-relaxed text-foreground/85">
            {problem.text}
          </p>
          {problem.actions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {problem.actions.map((action, i) =>
                action === "cases" ? (
                  <Link key={action} href="/#cases" className={i === 0 ? FIRST : OTHER}>
                    {LABELS[action]}
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                ) : (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onAction(action)}
                    disabled={busy === action}
                    aria-busy={busy === action || undefined}
                    className={cn(i === 0 ? FIRST : OTHER, "disabled:cursor-wait disabled:opacity-70")}
                  >
                    {busy === action ? (
                      <>
                        Checking your keys
                        <LoaderCircle aria-hidden="true" className="key-spin size-3.5" />
                      </>
                    ) : (
                      LABELS[action]
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
