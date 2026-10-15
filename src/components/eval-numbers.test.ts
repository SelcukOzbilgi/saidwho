import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EvalNumbers, LATEST, THREE_WAY } from "./eval-numbers";

// A summary table row's cells, by its label, from a result file pnpm eval wrote.
function row(file: string, label: string): string[] {
  const md = readFileSync(path.join(process.cwd(), file), "utf8");
  const line = md.split("\n").find((l) => l.startsWith(`| ${label} |`));
  if (!line) throw new Error(`${file} has no "${label}" row`);
  return line.split("|").slice(2, -1).map((c) => c.trim());
}

const ROWS = {
  verdicts: "Verdict right",
  years: "Earliest year within 2 years of the known one",
  usdPerQuote: "Nebius cost per quote",
  time: "Time per quote",
} as const;

describe("EvalNumbers", () => {
  it("gives the latest run's numbers as its result files have them", () => {
    for (const set of [LATEST.test, LATEST.holdout]) {
      expect(row(set.file, "Quotes run")).toEqual([String(set.quotes)]);
      expect(row(set.file, "Code (commit)")).toEqual([LATEST.commit]);
      for (const [key, label] of Object.entries(ROWS)) expect(row(set.file, label)).toEqual([set[key as keyof typeof ROWS]]);
    }
  });

  it("gives the three-way run's numbers as its result file has them", () => {
    for (const [key, label] of Object.entries(ROWS)) {
      expect(row(THREE_WAY.file, label)).toEqual(THREE_WAY.setups.map((s) => s[key as keyof typeof ROWS]));
    }
    const header = readFileSync(path.join(process.cwd(), THREE_WAY.file), "utf8").split("\n").find((l) => l.startsWith("|  |"));
    expect(header).toBe("|  | Cascade | All Ultra | All Lightning |");
  });

  it("links every result file on GitHub and leaves no em dash in the copy", () => {
    const html = renderToStaticMarkup(createElement(EvalNumbers));
    for (const file of [LATEST.test.file, LATEST.holdout.file, THREE_WAY.file]) {
      expect(html).toContain(`href="https://github.com/SelcukOzbilgi/saidwho/blob/main/${file}"`);
    }
    expect(html).not.toContain("—");
  });
});
