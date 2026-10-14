import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { parseEvalArgs } from "./args";
import { logPaths, readRunLog } from "./logs";
import { EVAL_SETS } from "./sets";

describe("parseEvalArgs", () => {
  it("runs the main set, every setup and every quote by default", () => {
    expect(parseEvalArgs([])).toEqual({ set: EVAL_SETS.main, only: null, setups: null, report: false, replayPlan: null });
  });

  it("reads each list, in any order", () => {
    expect(parseEvalArgs(["--setup", "cascade,ultra", "--set", "holdout", "--only", "be-yourself", "--report"])).toEqual({
      set: EVAL_SETS.holdout,
      only: ["be-yourself"],
      setups: ["cascade", "ultra"],
      report: true,
      replayPlan: null,
    });
    expect(parseEvalArgs(["--", "--set", "holdout"]).set).toBe(EVAL_SETS.holdout);
  });

  it("stops at an argument it doesn't know instead of falling back to the main set", () => {
    expect(() => parseEvalArgs(["--set=holdout"])).toThrow(/unknown argument --set=holdout/);
    expect(() => parseEvalArgs(["--sets", "holdout"])).toThrow(/unknown argument --sets/);
    expect(() => parseEvalArgs(["--set", "holdout", "cascade"])).toThrow(/unknown argument cascade/);
  });

  it("takes one runs directory to replay plans from, with any set", () => {
    expect(parseEvalArgs(["--set", "holdout", "--replay-plan", ".runs/eval-holdout", "--setup", "cascade"])).toMatchObject({
      set: EVAL_SETS.holdout,
      replayPlan: ".runs/eval-holdout",
      setups: ["cascade"],
    });
    expect(() => parseEvalArgs(["--replay-plan"])).toThrow(/needs a runs directory/);
    expect(() => parseEvalArgs(["--replay-plan", ""])).toThrow(/needs a runs directory/);
    expect(() => parseEvalArgs(["--replay-plan", "  "])).toThrow(/needs a runs directory/);
    expect(() => parseEvalArgs(["--replay-plan", "--setup", "cascade"])).toThrow(/needs a runs directory/);
    expect(() => parseEvalArgs(["--replay-plan", "a", "--replay-plan", "b"])).toThrow(/given twice/);
    expect(() => parseEvalArgs(["--replay-plans", "a"])).toThrow(/unknown argument --replay-plans/);
  });

  it("stops at a list that is missing, empty, repeated or names more than one set", () => {
    expect(() => parseEvalArgs(["--set"])).toThrow(/needs a comma-separated list/);
    expect(() => parseEvalArgs(["--set", "--setup", "cascade"])).toThrow(/--set needs/);
    expect(() => parseEvalArgs(["--only", ","])).toThrow(/--only needs/);
    expect(() => parseEvalArgs(["--set", "holdout", "--set", "main"])).toThrow(/given twice/);
    expect(() => parseEvalArgs(["--set", "main,holdout"])).toThrow(/one set/);
  });
});

// What the eval does with the arguments: which folder it resumes from and writes to.
describe("held-out routing and resume", () => {
  const runs = pathToFileURL(`${mkdtempSync(join(tmpdir(), "saidwho-runs-"))}/`);
  afterAll(() => rmSync(runs, { recursive: true, force: true }));
  const OLD = readFileSync(new URL("../cases/fear-itself.json", import.meta.url), "utf8");

  it("keeps a held-out run in its own folder, where only a held-out eval resumes it", () => {
    const holdout = logPaths(runs, parseEvalArgs(["--set", "holdout", "--setup", "cascade"]).set);
    const main = logPaths(runs, parseEvalArgs(["--setup", "cascade"]).set);
    mkdirSync(holdout.dir("cascade"), { recursive: true });
    writeFileSync(holdout.log("cascade", "be-yourself"), OLD);

    expect(fileURLToPath(holdout.log("cascade", "be-yourself"))).toMatch(/[/\\]eval-holdout[/\\]cascade[/\\]be-yourself\.json$/);
    expect(fileURLToPath(holdout.failed("cascade", "be-yourself"))).toMatch(/[/\\]eval-holdout[/\\]cascade[/\\]be-yourself\.failed\.json$/);
    // A logged quote is skipped next time, in its own set only.
    expect(readRunLog(holdout.log("cascade", "be-yourself"))).not.toBeNull();
    expect(readRunLog(main.log("cascade", "be-yourself"))).toBeNull();
    expect(fileURLToPath(main.log("cascade", "x"))).toMatch(/[/\\]eval[/\\]cascade[/\\]x\.json$/);
  });
});
