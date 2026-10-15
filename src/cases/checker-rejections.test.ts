import { describe, expect, it } from "vitest";

import { SNIPPET_NOT_ON_PAGE, SNIPPET_NOT_THE_SAYING } from "../agent/events";
import { checkerRejections } from "./checker-rejections";
import { CASES } from "./cases";

type Case = Parameters<typeof checkerRejections>[0][number];

const escalated = (url: string, reason: string) => ({ type: "escalated", step: "read", reason, url });
const read = (url: string) => ({ type: "page_read", url, outcome: "evidence" });
const node = (id: string, url: string, status: "exact" | "near" | "not_found") => ({ id, url, check: { status, score: 1 } });

const fake = (caseId: string, events: object[], nodes: object[]): Case =>
  ({ caseId, events, run: { nodes } }) as unknown as Case;

describe("checkerRejections", () => {
  it("counts a page once when a second reader on a bigger model found the snippet", () => {
    const c = fake("a", [read("u1"), escalated("u1", SNIPPET_NOT_ON_PAGE), read("u1")], [node("n1", "u1", "exact")]);
    expect(checkerRejections([c])).toEqual({ rejected: 1, rescued: 1, crossedOut: 0, example: null });
  });

  it("counts a page twice when the second reading was turned down too", () => {
    const c = fake("a", [read("u1"), escalated("u1", SNIPPET_NOT_THE_SAYING), read("u1")], [node("n1", "u1", "not_found")]);
    expect(checkerRejections([c])).toEqual({ rejected: 2, rescued: 0, crossedOut: 1, example: { caseId: "a", nodeId: "n1" } });
  });

  it("counts a page once when the second reader found no quote and the first card stayed", () => {
    const c = fake("a", [read("u1"), escalated("u1", SNIPPET_NOT_ON_PAGE)], [node("n1", "u1", "not_found")]);
    expect(checkerRejections([c])).toMatchObject({ rejected: 1, crossedOut: 1 });
  });

  it("counts a crossed-out card that was never read again, and ignores other reasons to reread", () => {
    const c = fake(
      "a",
      [read("u1"), escalated("u2", "a field was too long to be a quote"), read("u2")],
      [node("n1", "u1", "not_found"), node("n2", "u2", "exact")],
    );
    expect(checkerRejections([c])).toEqual({ rejected: 1, rescued: 0, crossedOut: 1, example: { caseId: "a", nodeId: "n1" } });
  });

  // The home page states these; a new or re-recorded case should change them on purpose.
  it("gives the bundled cases' numbers, with a crossed-out card to link to", () => {
    const counts = checkerRejections(CASES);
    expect(counts).toEqual({ rejected: 3, rescued: 1, crossedOut: 2, example: { caseId: "let-them-eat-cake", nodeId: expect.any(String) } });
    const example = CASES.find((c) => c.caseId === counts.example!.caseId)!;
    expect(example.run.nodes.find((n) => n.id === counts.example!.nodeId)?.check.status).toBe("not_found");
  });
});
