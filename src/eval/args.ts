import { type EvalSet, pickSet } from "./sets";

// Reads pnpm eval's arguments: --set, --setup and --only take a comma-separated
// list, --replay-plan and --cache one directory each, --report takes none. Every argument must be one of these, so a mistyped
// one (--set=holdout, --sets) stops the eval rather than quietly running the main
// set, whose logs would then be resumed and paid for in place of the held-out ones.

// replayPlan: a runs directory to take each quote's plan from (see loggedPlan).
// cache: a search cache directory to use instead of .runs/eval/search-cache/,
// such as another checkout's, so its searches aren't paid for again.
export type EvalArgs = {
  set: EvalSet;
  only: string[] | null;
  setups: string[] | null;
  report: boolean;
  replayPlan: string | null;
  cache: string | null;
};

const LISTS = ["set", "setup", "only"] as const;
const DIRS = ["replay-plan", "cache"] as const;

export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const lists: Partial<Record<(typeof LISTS)[number], string[]>> = {};
  let report = false;
  const dirs: Partial<Record<(typeof DIRS)[number], string>> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // pnpm passes on a "--" when one is typed before the arguments.
    if (arg === "--") continue;
    if (arg === "--report") {
      report = true;
      continue;
    }
    const dirName = DIRS.find((n) => arg === `--${n}`);
    if (dirName) {
      const dir = argv[i + 1];
      if (dirs[dirName] !== undefined) throw new Error(`--${dirName} is given twice`);
      // An empty one would quietly fall back: to fresh, paid planning, or to an empty cache.
      if (dir === undefined || dir.trim() === "" || dir.startsWith("--")) throw new Error(`--${dirName} needs a directory`);
      dirs[dirName] = dir;
      i++;
      continue;
    }
    const name = LISTS.find((n) => arg === `--${n}`);
    if (!name) throw new Error(`unknown argument ${arg}; use --set, --setup, --only, --replay-plan, --cache or --report`);
    if (lists[name]) throw new Error(`--${name} is given twice`);
    const next = argv[i + 1];
    const values = next === undefined || next.startsWith("--") ? [] : next.split(",").filter(Boolean);
    if (values.length === 0) throw new Error(`--${name} needs a comma-separated list`);
    lists[name] = values;
    i++;
  }
  return {
    set: pickSet(lists.set ?? null),
    only: lists.only ?? null,
    setups: lists.setup ?? null,
    report,
    replayPlan: dirs["replay-plan"] ?? null,
    cache: dirs.cache ?? null,
  };
}
