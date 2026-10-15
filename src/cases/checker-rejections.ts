import { SNIPPET_NOT_ON_PAGE, SNIPPET_NOT_THE_SAYING } from "../agent/events";
import type { ExampleCase } from "./cases";

// How often the Checker turned a reader's snippet down across saved runs, for
// the home page. A turned-down snippet sends its page to a second reader on a
// bigger model; that reading's node replaces the first, and when it has none,
// the first one stays, crossed out. So a page counts once for its first
// reading, and once more when its second reading was turned down too.

export type CheckerRejections = {
  // Snippets turned down, first and second readings alike.
  rejected: number;
  // Pages whose second reading found the snippet on the page.
  rescued: number;
  // Pages that still show a crossed-out card.
  crossedOut: number;
  // The first crossed-out card, to link to.
  example: { caseId: string; nodeId: string } | null;
};

const CHECKER_REASONS = new Set([SNIPPET_NOT_ON_PAGE, SNIPPET_NOT_THE_SAYING]);

export function checkerRejections(cases: readonly Pick<ExampleCase, "caseId" | "events" | "run">[]): CheckerRejections {
  const out: CheckerRejections = { rejected: 0, rescued: 0, crossedOut: 0, example: null };
  for (const { caseId, events, run } of cases) {
    const reread = new Set<string>();
    const readings = new Map<string, number>();
    for (const e of events) {
      if (e.type === "escalated" && e.step === "read" && e.url && CHECKER_REASONS.has(e.reason)) reread.add(e.url);
      if (e.type === "page_read" && e.outcome === "evidence") readings.set(e.url, (readings.get(e.url) ?? 0) + 1);
    }
    out.rejected += reread.size;
    for (const node of run.nodes) {
      const crossed = node.check.status === "not_found";
      if (!crossed) {
        if (reread.has(node.url)) out.rescued++;
        continue;
      }
      out.crossedOut++;
      out.example ??= { caseId, nodeId: node.id };
      // Not reread (the run stopped first), or reread and turned down again.
      if (!reread.has(node.url) || (readings.get(node.url) ?? 0) >= 2) out.rejected++;
    }
  }
  return out;
}
