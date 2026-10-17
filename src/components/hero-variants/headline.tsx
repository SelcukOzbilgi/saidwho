import type { HeroCaseProps } from "./types";

// /?hero=headline: no card; the quote as a headline, its credit corrected in place.
// A stand-in until it is built.
export function HeroHeadline({ intro }: HeroCaseProps) {
  return (
    <div className="mt-6 sm:mt-8">
      {intro}
      <p className="mt-8 text-sm text-muted">Headline: being built.</p>
    </div>
  );
}
