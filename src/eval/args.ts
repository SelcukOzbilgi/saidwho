import { type EvalSet, pickSet } from "./sets";

// Reads pnpm eval's arguments: --set, --setup and --only take a comma-separated
// list, --replay-plan one directory, --report takes none. Every argument must be one of these, so a mistyped
// one (--set=holdout, --sets) stops the eval rather than quietly running the main
// set, whose logs would then be resumed and paid for in place of the held-out ones.

// replayPlan: a runs directory to take each quote's plan from (see loggedPlan).
export type EvalArgs = { set: EvalSet; only: string[] | null; setups: string[] | null; report: boolean; replayPlan: string | null };

const LISTS = ["set", "setup", "only"] as const;

export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const lists: Partial<Record<(typeof LISTS)[number], string[]>> = {};
  let report = false;
  let replayPlan: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // pnpm passes on a "--" when one is typed before the arguments.
    if (arg === "--") continue;
    if (arg === "--report") {
      report = true;
      continue;
    }
    if (arg === "--replay-plan") {
      const dir = argv[i + 1];
      if (replayPlan !== null) throw new Error("--replay-plan is given twice");
      // An empty one would quietly run fresh, paid planning instead.
      if (dir === undefined || dir.trim() === "" || dir.startsWith("--")) throw new Error("--replay-plan needs a runs directory");
      replayPlan = dir;
      i++;
      continue;
    }
    const name = LISTS.find((n) => arg === `--${n}`);
    if (!name) throw new Error(`unknown argument ${arg}; use --set, --setup, --only, --replay-plan or --report`);
    if (lists[name]) throw new Error(`--${name} is given twice`);
    const next = argv[i + 1];
    const values = next === undefined || next.startsWith("--") ? [] : next.split(",").filter(Boolean);
    if (values.length === 0) throw new Error(`--${name} needs a comma-separated list`);
    lists[name] = values;
    i++;
  }
  return { set: pickSet(lists.set ?? null), only: lists.only ?? null, setups: lists.setup ?? null, report, replayPlan };
}
