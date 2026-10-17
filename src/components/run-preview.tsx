// How long the saved runs took and what they cost on Nebius, lowest and highest.
export type TypicalRun = { seconds: readonly [number, number]; usd: readonly [number, number] };

// From the saved cases, on the server, so the cases' event logs stay out of the
// form's bundle. Runs without a time or a cost don't count.
export function typicalRun(runs: readonly { seconds: number | null; nebiusUsd: number }[]): TypicalRun | null {
  const done = runs.filter((run) => run.seconds !== null && run.nebiusUsd > 0);
  if (done.length === 0) return null;
  const seconds = done.map((run) => run.seconds!);
  const usd = done.map((run) => run.nebiusUsd);
  return { seconds: [Math.min(...seconds), Math.max(...seconds)], usd: [Math.min(...usd), Math.max(...usd)] };
}

// "30 s" under a minute and a half, whole minutes above it, so a range reads as speech.
export const roughTime = (seconds: number): string =>
  seconds < 90 ? `${Math.max(10, Math.round(seconds / 10) * 10)} s` : `${Math.round(seconds / 60)} min`;

const PENDING = ["Verdict", "Earliest trace", "Every page it read"] as const;

// Under the quote's own fields on a wide screen, where the keys next to them
// run longer: the case the run will end with, drawn from what has been typed
// so far. The quote, the name and the language fill in as they are typed;
// what only the run can say waits as an empty bar. Below it, how long the
// saved runs took and what they cost, for a visitor paying with their own keys.
export function RunPreview({
  quote,
  credit,
  language,
  typical,
}: {
  quote: string;
  credit: string;
  // The language's code and name, when one was picked.
  language: { code: string; name: string } | null;
  typical: TypicalRun | null;
}) {
  const said = quote.trim();
  const name = credit.trim();

  return (
    <figure aria-label="What you'll get back" className="flex min-w-0 flex-1 flex-col rounded-sm border border-dashed border-line px-4 py-3.5">
      <figcaption className="text-xs text-muted">What you&apos;ll get back</figcaption>
      {/* Keyed on whether there is a quote yet, so the words ease in once, not on
          every key. One line: the field right above shows all of it. */}
      <blockquote
        key={said ? "said" : "empty"}
        lang={language?.code}
        dir="auto"
        className="arrive mt-1.5 truncate font-serif text-lg leading-snug italic"
      >
        {said ? `“${said}”` : <span className="text-muted">Your quote shows here as you type it.</span>}
      </blockquote>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span key={name ? "name" : "none"} className="arrive">
          {name ? (
            <>
              Usually credited to <span className="text-foreground">{name}</span>
            </>
          ) : (
            "Credited to whoever the pages name"
          )}
        </span>
        {language && (
          <span key={language.code} className="arrive rounded-full border border-line px-2 py-px text-[11px]">
            {language.name}
          </span>
        )}
      </p>

      {/* What only the run can say, side by side, each an empty bar until then. */}
      <dl className="mt-3 grid grid-cols-3 gap-4 border-t border-line pt-3 text-xs">
        {PENDING.map((label) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-muted">{label}</dt>
            <dd className="mt-1.5 h-1.5 rounded-full bg-foreground/[0.07]">
              <span className="sr-only">After the run</span>
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-auto pt-3 text-xs text-muted">
        Filled in after the run.
        {typical &&
          ` Saved runs took ${roughTime(typical.seconds[0])} to ${roughTime(typical.seconds[1])}, $${typical.usd[0].toFixed(3)} to $${typical.usd[1].toFixed(3)} on Nebius.`}
      </p>
    </figure>
  );
}
