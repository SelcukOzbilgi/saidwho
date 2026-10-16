// The eval's headline numbers, for the home page. They are copied from the
// result files pnpm eval writes, and eval-numbers.test.ts checks each one
// against its file, so a new run that changes them fails the tests until this
// is updated too.

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

function SetCard({ title, scores }: { title: string; scores: Scores & { quotes: number } }) {
  return (
    <div className="rounded-sm border border-line bg-card p-4">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        {title} · {scores.quotes} quotes
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <dt className="sr-only">Verdicts that match the known answer</dt>
          <dd>
            <span className="font-serif text-4xl font-semibold tabular-nums">{scores.verdicts}</span>
            <span className="mt-0.5 block text-sm text-muted">verdicts match the known answer</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Earliest year within two years</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{scores.years}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Nebius cost and time per quote</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {scores.usdPerQuote} · {scores.time}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function EvalNumbers() {
  const [mix, ultra] = THREE_WAY.setups;
  return (
    <section id="eval" aria-labelledby="eval-title" className="scroll-mt-6">
      <h2 id="eval-title" className="font-serif text-3xl font-semibold">
        How well it does
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        The eval runs quotes whose origins have already been researched, with Quote Investigator, Wikiquote, Wikipedia
        and each answer&apos;s own pages left out of the search. The held-out quotes were never run until every fix was
        in, so none of them shaped the code.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <SetCard title="Test set" scores={LATEST.test} />
        <SetCard title="Held-out set" scores={LATEST.holdout} />
      </div>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        Run on {LATEST.date} at commit <span className="font-mono text-xs">{LATEST.commit}</span>. On the test set
        that is no better than the first run, which got {mix.verdicts}, and ten held-out quotes is a small sample. Quote
        by quote: <FileLink file={LATEST.test.file}>test set</FileLink>,{" "}
        <FileLink file={LATEST.holdout.file}>held-out set</FileLink>.
      </p>

      <div className="mt-8 rounded-sm border border-line bg-card p-4 sm:p-5">
        <h3 className="font-medium">
          As many right verdicts as every step on Ultra, at about a tenth of the Nebius cost
        </h3>
        <div className="mt-3">
          <table className="w-full text-left text-sm tabular-nums">
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
            <tbody>
              {THREE_WAY.setups.map((s) => (
                <tr key={s.name} className="border-b border-line last:border-0">
                  <th scope="row" className={`py-2 pr-3 text-left ${s === mix ? "font-medium" : "font-normal"}`}>
                    {s.name}
                  </th>
                  <td className="px-2 py-2 sm:px-3">{s.verdicts}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">{s.years}</td>
                  <td className={`py-2 pl-3 text-right font-mono text-xs ${s === mix ? "text-accent-ink" : ""}`}>
                    {s.usdPerQuote}
                  </td>
                </tr>
              ))}
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
    </section>
  );
}
