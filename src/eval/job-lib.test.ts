import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

// eval/job-lib.sh, the part of the Nebius job that picks the set and moves its
// runs to and from the bucket, run in bash in a temp folder with a fake bucket.

const LIB = fileURLToPath(new URL("../../eval/job-lib.sh", import.meta.url));
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folders() {
  const root = mkdtempSync(join(tmpdir(), "saidwho-job-"));
  temps.push(root);
  const work = join(root, "work");
  const bucket = join(root, "bucket");
  mkdirSync(work);
  mkdirSync(bucket);
  return { work, bucket };
}

const touch = (path: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "{}\n");
};

function bash(script: string, evalArgs: string, work: string, bucket: string): string {
  return execFileSync("bash", ["-c", `set -euo pipefail; source "${LIB}"; ${script}`], {
    cwd: work,
    env: { ...process.env, EVAL_ARGS: evalArgs, EVAL_OUTPUT: bucket },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const parse = (evalArgs: string) => {
  const { work, bucket } = folders();
  const out = bash('parse_eval_args; printf "%s\\n" "$runs" "$results" ${eval_args[@]+"${eval_args[@]}"}', evalArgs, work, bucket);
  const [runs, results, ...args] = out.trimEnd().split("\n");
  return { runs, results, args };
};

describe("parse_eval_args", () => {
  it("runs the main set with no arguments", () => {
    expect(parse("")).toEqual({ runs: "eval", results: "results.md", args: [] });
  });

  it("finds the held-out set however the arguments are spaced", () => {
    for (const messy of ["--set  holdout", "\t--set\tholdout\t", "--setup cascade\n--set\nholdout\n", "  --setup   cascade  --set holdout  "]) {
      expect(parse(messy), JSON.stringify(messy)).toMatchObject({ runs: "eval-holdout", results: "holdout-results.md" });
    }
    expect(parse("--setup cascade\n--set\tholdout").args).toEqual(["--setup", "cascade", "--set", "holdout"]);
  });

  it("keeps the main set when it's named or only other options are given", () => {
    expect(parse("--set main --setup cascade")).toEqual({
      runs: "eval",
      results: "results.md",
      args: ["--set", "main", "--setup", "cascade"],
    });
    expect(parse(" --setup\tcascade ").runs).toBe("eval");
  });

  it("stops the job at a set it doesn't know", () => {
    for (const bad of ["--set heldout", "--set=holdout", "--set", "--set main,holdout"]) {
      expect(() => parse(bad), bad).toThrow(/EVAL_ARGS/);
    }
  });
});

describe("restore_runs and copy_out", () => {
  it.each([
    ["--set  holdout\t--setup cascade", "eval-holdout", "holdout-results.md", "eval"],
    ["\n--setup\tcascade\n", "eval", "results.md", "eval-holdout"],
  ])("with EVAL_ARGS %j use only %s", (evalArgs, runs, results, other) => {
    const { work, bucket } = folders();
    // The bucket holds runs from an earlier job, for both sets.
    touch(join(bucket, runs, "cascade", "a.json"));
    touch(join(bucket, other, "cascade", "not-this-set.json"));

    bash("parse_eval_args; restore_runs", evalArgs, work, bucket);
    expect(existsSync(join(work, ".runs", runs, "cascade", "a.json"))).toBe(true);
    expect(existsSync(join(work, ".runs", other))).toBe(false);

    // This job adds a run and writes the scores.
    touch(join(work, ".runs", runs, "ultra", "b.json"));
    touch(join(work, "eval", results));
    bash("parse_eval_args; copy_out", evalArgs, work, bucket);
    expect(existsSync(join(bucket, runs, "ultra", "b.json"))).toBe(true);
    expect(existsSync(join(bucket, runs, results))).toBe(true);
    expect(existsSync(join(bucket, other, "ultra"))).toBe(false);
  });

  it("copies nothing out when no bucket is mounted", () => {
    const { work, bucket } = folders();
    rmSync(bucket, { recursive: true });
    touch(join(work, ".runs", "eval", "cascade", "a.json"));
    expect(bash("parse_eval_args; copy_out", "", work, bucket)).toBe("");
    expect(existsSync(bucket)).toBe(false);
  });
});
