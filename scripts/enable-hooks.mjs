// Run by `pnpm install` (the prepare script). Points git at .githooks, where the
// pre-commit secret scan lives. A copy of the code that isn't a git repo, like a
// `vercel deploy` upload, has no hooks to set, so it is skipped there.
// Plain Node rather than a shell line, so it works in cmd.exe too.

import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
} catch {
  process.exit(0);
}
execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
