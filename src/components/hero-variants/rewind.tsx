import type { HeroCaseProps } from "./types";

// /?hero=rewind: the case as a file whose trail runs back in time to the earliest trace.
// A stand-in until it is built.
export function HeroRewind({ intro }: HeroCaseProps) {
  return (
    <div className="mt-6 sm:mt-8">
      {intro}
      <p className="mt-8 text-sm text-muted">Rewind: being built.</p>
    </div>
  );
}
