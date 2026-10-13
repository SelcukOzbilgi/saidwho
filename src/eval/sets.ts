// The quote sets pnpm eval can run, picked with --set. Each set keeps its own run
// logs and its own results file, so a held-out run never mixes with the main ones.
// Paths are relative: file and results to eval/, runs to .runs/.

export type EvalSet = {
  name: string;
  file: string;
  runs: string;
  results: string;
  // A paragraph for the top of the results file, or null.
  about: string | null;
};

export const EVAL_SETS = {
  main: { name: "main", file: "quotes.jsonl", runs: "eval", results: "results.md", about: null },
  holdout: {
    name: "holdout",
    file: "holdout.jsonl",
    runs: "eval-holdout",
    results: "holdout-results.md",
    about:
      "This is the held-out set. Its quotes were picked after the fixes that came from looking at the main set's failures, " +
      "so none of them shaped the code. It is run rarely, so it stays that way.",
  },
} as const satisfies Record<string, EvalSet>;

export function pickSet(values: readonly string[] | null): EvalSet {
  if (values === null) return EVAL_SETS.main;
  const names = Object.keys(EVAL_SETS);
  if (values.length !== 1) throw new Error(`--set takes one set: ${names.join(" or ")}`);
  const set = (EVAL_SETS as Record<string, EvalSet>)[values[0]];
  if (!set) throw new Error(`no set called ${values[0]}; use ${names.join(" or ")}`);
  return set;
}
