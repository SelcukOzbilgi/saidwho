import type { HeroCaseProps } from "./types";

// /?hero=run: the case's run played back in short, step by step, ending on the verdict.
// A stand-in until it is built.
export function HeroLiveRun({ intro }: HeroCaseProps) {
  return (
    <div className="mt-6 sm:mt-8">
      {intro}
      <p className="mt-8 text-sm text-muted">Live run: being built.</p>
    </div>
  );
}
