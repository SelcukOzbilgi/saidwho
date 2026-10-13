import { z } from "zod";

// Which code produced an eval run: the commit it ran on and, when src/ had changes
// that weren't committed, a short hash of those changes, since then the commit
// alone doesn't say what ran. Two runs with the same label ran the same src/.
// Logs written before this was recorded have no fingerprint; they read as null.
// git-fingerprint.ts takes it from git; this file stays free of Node so the
// gallery, which reads eval logs too, can use the schema.

export const codeFingerprintSchema = z.strictObject({
  commit: z.string().regex(/^[0-9a-f]{4,40}$/),
  // null when src/ matched the commit.
  changes: z
    .string()
    .regex(/^[0-9a-f]{8}$/)
    .nullable(),
});

export type CodeFingerprint = z.infer<typeof codeFingerprintSchema>;

export const NOT_RECORDED = "not recorded";

export const codeLabel = (code: CodeFingerprint | null): string =>
  code ? `${code.commit}${code.changes ? `-dirty-${code.changes}` : ""}` : NOT_RECORDED;

// One line for a group of runs: the label when they all share it, otherwise each
// label with how many runs it covers, in the order they first appear.
export function describeCode(codes: readonly (CodeFingerprint | null)[]): string {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const label = codeLabel(code);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (counts.size === 0) return "-";
  if (counts.size === 1) return [...counts.keys()][0];
  return [...counts].map(([label, n]) => `${label} (${n})`).join(", ");
}
