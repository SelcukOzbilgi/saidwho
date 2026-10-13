import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { codeFingerprint, gitIn, type RunGit } from "./git-fingerprint";

const failing =
  (error: object): RunGit =>
  () => {
    throw error;
  };

describe("codeFingerprint with git failing", () => {
  it("gives null when git isn't installed", () => {
    expect(codeFingerprint(failing(Object.assign(new Error("spawnSync git ENOENT"), { code: "ENOENT" })))).toBeNull();
  });

  it("gives null outside a git checkout", () => {
    const error = Object.assign(new Error("Command failed: git rev-parse --short HEAD"), {
      status: 128,
      stderr: "fatal: not a git repository (or any of the parent directories): .git\n",
    });
    expect(codeFingerprint(failing(error))).toBeNull();
  });

  it("lets any other git error surface", () => {
    const error = Object.assign(new Error("Command failed: git rev-parse --short HEAD"), {
      status: 128,
      stderr: "fatal: bad object HEAD\n",
    });
    expect(() => codeFingerprint(failing(error))).toThrow(/Command failed/);
    const brokenStatus: RunGit = (args) => {
      if (args[0] === "rev-parse") return "603995a\n";
      throw Object.assign(new Error("Command failed: git status"), { status: 128, stderr: "fatal: index file corrupt\n" });
    };
    expect(() => codeFingerprint(brokenStatus)).toThrow(/git status/);
  });

  it("rejects output that isn't a commit", () => {
    expect(() => codeFingerprint(() => "HEAD\n")).toThrow(/doesn't look like one/);
  });
});

// A real repo in a temp folder, so the commands and the hash are tested as they run.
describe("codeFingerprint on a real repo", () => {
  let repo: string;
  let outside: string;
  const saved: Record<string, string | undefined> = {};
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.org", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
      stdio: "ignore",
    });
  const write = (path: string, text: string) => writeFileSync(join(repo, path), text);
  const fingerprint = () => codeFingerprint(gitIn(repo));

  beforeAll(() => {
    // A git hook running these tests would point git at the outer repo.
    for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    repo = mkdtempSync(join(tmpdir(), "saidwho-fingerprint-"));
    outside = mkdtempSync(join(tmpdir(), "saidwho-not-a-repo-"));
    git("init", "-q");
    mkdirSync(join(repo, "src"));
    write("src/a.ts", "export const a = 1;\n");
    write("README.md", "readme\n");
    git("add", ".");
    git("commit", "-q", "-m", "first");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    for (const [name, value] of Object.entries(saved)) if (value !== undefined) process.env[name] = value;
  });

  it("records a clean src/ as the commit alone, even with changes elsewhere", () => {
    write("README.md", "changed outside src\n");
    const code = fingerprint();
    expect(code?.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(code?.changes).toBeNull();
  });

  it("gives different changes different hashes, and the same changes the same hash", () => {
    write("src/a.ts", "export const a = 2;\n");
    const first = fingerprint();
    write("src/a.ts", "export const a = 3;\n");
    const second = fingerprint();
    write("src/a.ts", "export const a = 2;\n");
    const again = fingerprint();
    expect(first?.changes).toMatch(/^[0-9a-f]{8}$/);
    expect(second?.changes).not.toBe(first?.changes);
    expect(again).toEqual(first);
    write("src/a.ts", "export const a = 1;\n");
  });

  it("counts an untracked file in src/ by its contents", () => {
    write("src/b.ts", "export const b = 1;\n");
    const first = fingerprint();
    write("src/b.ts", "export const b = 2;\n");
    const second = fingerprint();
    expect(first?.changes).toMatch(/^[0-9a-f]{8}$/);
    expect(second?.changes).not.toBe(first?.changes);
    rmSync(join(repo, "src/b.ts"));
    expect(fingerprint()?.changes).toBeNull();
  });

  it("gives null in a folder that isn't a git checkout", () => {
    expect(codeFingerprint(gitIn(outside))).toBeNull();
  });
});
