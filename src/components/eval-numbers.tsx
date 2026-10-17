// The eval's headline numbers, for the home page. They are copied from the
// result files pnpm eval writes, and eval-numbers.test.ts checks each one
// against its file, so a new run that changes them fails the tests until this
// is updated too.

import type { CSSProperties, ReactNode } from "react";

import { Reveal } from "./reveal";
import { ScoreMeter } from "./score-meter";

const REPO = "https://github.com/SelcukOzbilgi/saidwho/blob/main";

type Scores = { verdicts: string; years: string; usdPerQuote: string; time: string };
type EvalSet = Scores & { file: string; quotes: number };

export const LATEST: { date: string; commit: string; test: EvalSet; holdout: EvalSet } = {
  date: "October 14",
  commit: "a53fccf",
  test: { file: "eval/results.md", quotes: 20, verdicts: "13 of 20", years: "10 of 19", usdPerQuote: "$0.0076", time: "44s" },
  holdout: { file: "eval/holdout-results.md", quotes: 10, verdicts: "10 of 10", years: "6 of 10", usdPerQuote: "$0.0070", time: "37s" },
};

// The run that put the app's mix of models next to every step on one model.
// The setups are in the order of the file's columns.
export const THREE_WAY: { date: string; commit: string; file: string; setups: (Scores & { name: string })[] } = {
  date: "October 12",
  commit: "baf49da",
  file: "eval/results-2026-10-12.md",
  setups: [
    { name: "The app's mix", verdicts: "14 of 20", years: "9 of 19", usdPerQuote: "$0.0045", time: "51s" },
    { name: "Every step on Ultra", verdicts: "14 of 20", years: "12 of 19", usdPerQuote: "$0.0426", time: "36s" },
    { name: "Every step on Lightning", verdicts: "9 of 20", years: "8 of 19", usdPerQuote: "$0.0048", time: "69s" },
  ],
};

function FileLink({ file, children }: { file: string; children: string }) {
  return (
    <a href={`${REPO}/${file}`} className="underline decoration-line underline-offset-4 hover:decoration-foreground">
      {children}
    </a>
  );
}

// "13 of 20" as its two numbers, for the count and the bar; null for anything else.
export function parseScore(score: string): { got: number; of: number } | null {
  const match = /^(\d+) of (\d+)$/.exec(score);
  return match ? { got: Number(match[1]), of: Number(match[2]) } : null;
}

// A score as the file has it, its first number counting up as its bar fills.
// delay is in seconds after it comes into view.
function Score({
  score,
  strong,
  delay,
  numberClassName,
  children,
}: {
  score: string;
  strong?: boolean;
  delay?: number;
  numberClassName?: string;
  children?: ReactNode;
}) {
  const parsed = parseScore(score);
  if (!parsed)
    return (
      <>
        <span className={numberClassName}>{score}</span>
        {children}
      </>
    );
  return (
    <ScoreMeter got={parsed.got} of={parsed.of} strong={strong} delay={delay} numberClassName={numberClassName}>
      {children}
    </ScoreMeter>
  );
}

// i is the card's place, so the test set's scores go before the held-out set's.
function SetCard({ title, scores, i }: { title: string; scores: Scores & { quotes: number }; i: number }) {
  return (
    <div className="reveal-up rounded-sm border border-line bg-card p-5" style={{ "--i": i } as CSSProperties}>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        {title} · {scores.quotes} quotes
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
        <div className="col-span-2">
          <dt className="sr-only">Verdicts that match the known answer</dt>
          <dd>
            <Score
              score={scores.verdicts}
              strong
              delay={0.15 + 0.15 * i}
              numberClassName="font-serif text-5xl font-semibold tabular-nums sm:text-6xl"
            >
              <span className="mt-1 block text-sm text-muted">verdicts match the known answer</span>
            </Score>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Earliest year within two years</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            <Score score={scores.years} delay={0.6 + 0.15 * i} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Nebius cost and time per quote</dt>
          {/* Proportional figures: Schibsted Grotesk's tabular set gives the decimal point a digit's width. */}
          <dd className="mt-0.5 font-medium">
            {scores.usdPerQuote} · {scores.time}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// "$0.0426" as a number, for the length of its bar.
const usd = (text: string) => Number(text.replace(/[^0-9.]/g, ""));

// When a part of the three-way table comes in, in ms after the table is seen;
// the Home: eval and cases block of globals.css reads it.
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

// Each column starts a short step after the one before it, and the cost column
// goes dearest first, so the mix's short bar is the last to land. A bar draws
// for BAR_MS after BAR_WAIT, and the heading's "about a tenth" is marked once
// the mix's has landed. The whole table is in place in under 1.4 s.
const BAR_WAIT = 60;
const BAR_MS = 450;
const COL_AT = { name: 0, verdicts: 200, years: 400 };
const COST_AT = (() => {
  const order = THREE_WAY.setups.map((s, i) => ({ i, cost: usd(s.usdPerQuote) })).sort((a, b) => b.cost - a.cost);
  const rows: number[] = [];
  order.forEach(({ i }, k) => (rows[i] = 600 + 120 * k));
  // The mix is the first setup.
  return { rows, end: rows[0] + BAR_WAIT + BAR_MS };
})();

export function EvalNumbers() {
  const [mix, ultra] = THREE_WAY.setups;
  const dearest = Math.max(...THREE_WAY.setups.map((s) => usd(s.usdPerQuote)));
  return (
    <section id="eval" aria-labelledby="eval-title" className="scroll-mt-6">
      <Reveal>
        <h2 id="eval-title" className="reveal-up font-serif text-3xl font-semibold sm:text-4xl">
          How well it does
        </h2>
        <p className="reveal-up mt-2 max-w-2xl text-muted">
          The eval runs quotes whose origins have already been researched, with Quote Investigator, Wikiquote, Wikipedia
          and each answer&apos;s own pages left out of the search. The held-out quotes were never run until every fix was
          in, so none of them shaped the code.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <SetCard title="Test set" scores={LATEST.test} i={1} />
          <SetCard title="Held-out set" scores={LATEST.holdout} i={2} />
        </div>
        <p className="reveal-up mt-3 max-w-3xl text-sm text-muted" style={{ "--i": 3 } as CSSProperties}>
          Run on {LATEST.date} at commit <span className="font-mono text-xs">{LATEST.commit}</span>. On the test set
          that is no better than the first run, which got {mix.verdicts}, and ten held-out quotes is a small sample. Quote
          by quote: <FileLink file={LATEST.test.file}>test set</FileLink>,{" "}
          <FileLink file={LATEST.holdout.file}>held-out set</FileLink>.
        </p>
      </Reveal>

      <Reveal className="mt-8">
        <div className="reveal-up rounded-sm border border-line bg-card p-4 sm:p-6">
          <h3 className="font-serif text-xl font-semibold sm:text-2xl">
            As many right verdicts as every step on Ultra, at{" "}
            <span className="ev-marker marker" style={at(COST_AT.end)}>
              about a tenth of the Nebius cost
            </span>
          </h3>
          <div className="mt-4">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-normal">
                    Test set, {THREE_WAY.date}
                  </th>
                  <th scope="col" className="px-2 py-2 font-normal sm:px-3">
                    Verdicts right
                  </th>
                  {/* On a phone the year column goes; the note under the table gives the years that matter. */}
                  <th scope="col" className="hidden px-3 py-2 font-normal sm:table-cell">
                    Earliest year
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-normal">
                    Nebius per quote
                  </th>
                </tr>
              </thead>
              {/* Figures line up, but the header's comma keeps its own width. The
                  table fills in a column at a time, the order of the heading's
                  claim: the setups, their verdicts, their years, then their cost,
                  the dearest first so the mix's short bar lands last. A row under
                  the pointer stays bright while the others fade back. */}
              <tbody
                className="ev-rows tabular-nums"
                style={{ "--bar-wait": `${BAR_WAIT}ms`, "--bar-ms": `${BAR_MS}ms` } as CSSProperties}
              >
                {THREE_WAY.setups.map((s, i) => {
                  const verdicts = parseScore(s.verdicts);
                  return (
                    <tr key={s.name} className={`border-b border-line last:border-0 ${s === mix ? "bg-accent/5" : ""}`}>
                      <th
                        scope="row"
                        className={`ev-cell py-2.5 pr-3 text-left ${s === mix ? "font-medium" : "font-normal"}`}
                        style={at(COL_AT.name + 50 * i)}
                      >
                        {s.name}
                      </th>
                      <td className="ev-cell px-2 py-2.5 sm:px-3" style={at(COL_AT.verdicts + 50 * i)}>
                        <span className="flex items-center gap-2.5">
                          {/* Equal bars for equal verdicts, on one scale as in eugeneshilow's Paired Bars on 21st.dev, from a width where they fit. */}
                          {verdicts && (
                            <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-line md:block">
                              <span
                                className={`ev-bar block h-full rounded-full ${s === mix ? "bg-accent" : "bg-foreground/40"}`}
                                style={{ width: `${(100 * verdicts.got) / verdicts.of}%` }}
                              />
                            </span>
                          )}
                          {s.verdicts}
                        </span>
                      </td>
                      <td className="ev-cell hidden px-3 py-2.5 sm:table-cell" style={at(COL_AT.years + 50 * i)}>
                        {s.years}
                      </td>
                      <td className="ev-cell py-2.5 pl-3" style={at(COST_AT.rows[i])}>
                        {/* The bar is the cost against the dearest setup, so a tenth looks like one. */}
                        <span className="flex items-center justify-end gap-2.5">
                          <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                            <span
                              className={`ev-bar block h-full rounded-full ${s === mix ? "bg-accent" : "bg-foreground/40"}`}
                              style={{ width: `${(100 * usd(s.usdPerQuote)) / dearest}%` }}
                            />
                          </span>
                          <span className={`font-mono text-xs ${s === mix ? "text-accent-ink" : ""}`}>{s.usdPerQuote}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted">
            Ultra on every step found the earliest year more often, {ultra.years} against {mix.years}. Run at commit{" "}
            <span className="font-mono text-xs">{THREE_WAY.commit}</span>;{" "}
            <FileLink file={THREE_WAY.file}>scores quote by quote</FileLink>. A quote costs about 70% more than on{" "}
            {THREE_WAY.date}, mostly because the Planner moved from Nemotron 3 Super to Ultra.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
