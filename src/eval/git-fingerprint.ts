import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { type CodeFingerprint, codeFingerprintSchema } from "./fingerprint";

// Takes an eval run's code fingerprint from git. Node only.

// Runs git with these arguments in the repo and returns what it printed, or throws
// the way execFileSync does: code ENOENT when git isn't installed, or the exit
// status and stderr when git fails.
export type RunGit = (args: readonly string[]) => string;

export const gitIn =
  (repo: string): RunGit =>
  (args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // A big uncommitted diff is still hashed, not cut off.
      maxBuffer: 256 * 1024 * 1024,
    });

// The two cases that only mean there is no commit to record: git isn't installed,
// or the code isn't a git checkout, say a downloaded copy. Anything else, like a
// broken repo, is a real error and surfaces.
function isHarmless(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, stderr } = error as { code?: unknown; stderr?: unknown };
  if (code === "ENOENT") return true;
  return /not a git repository/i.test(String(stderr ?? ""));
}

// null when there is no commit to record (see isHarmless); throws otherwise.
export function codeFingerprint(git: RunGit): CodeFingerprint | null {
  let commit: string;
  try {
    commit = git(["rev-parse", "--short", "HEAD"]).trim();
  } catch (error) {
    if (isHarmless(error)) return null;
    throw error;
  }
  // Untracked files count: a new file in src/ changes what runs.
  const dirty = git(["status", "--porcelain", "--", "src"]).trim() !== "";
  const changes = dirty ? hashChanges(git) : null;
  const parsed = codeFingerprintSchema.safeParse({ commit, changes });
  if (!parsed.success) throw new Error(`git gave a commit that doesn't look like one: ${commit.slice(0, 50)}`);
  return parsed.data;
}

// A short hash of what src/ holds beyond the commit: the diff of tracked files
// against it, staged or not, and each untracked file's path and contents.
function hashChanges(git: RunGit): string {
  const hash = createHash("sha256");
  hash.update(git(["diff", "--binary", "HEAD", "--", "src"]));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", "src"]).split("\0").filter(Boolean).sort();
  if (untracked.length > 0) {
    const blobs = git(["hash-object", "--", ...untracked]).trim().split("\n");
    untracked.forEach((path, i) => hash.update(`\0${path}\0${blobs[i]}`));
  }
  return hash.digest("hex").slice(0, 8);
}
