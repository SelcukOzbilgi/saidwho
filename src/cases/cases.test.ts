import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ANSWER_SITES, hostOf } from "../agent/orchestrator";
import { parseEvalCases } from "../eval/cases";
import { CASES, parseCaseLog } from "./cases";

const evalCases = parseEvalCases(readFileSync(new URL("../../eval/quotes.jsonl", import.meta.url), "utf8"));

describe("example cases", () => {
  it("lists each case once", () => {
    const ids = CASES.map((c) => c.caseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CASES.map((c) => [c.caseId, c] as const))("%s is a finished run of its test-set quote", (id, example) => {
    const known = evalCases.find((c) => c.id === id);
    expect(known).toBeDefined();
    expect(example.run.quote).toBe(known?.quote);
    expect(example.run.popularAttribution).toBe(known?.popular_attribution);
    expect(example.run.finished).toBe(true);
    expect(example.run.stopped).toBeNull();
    // As in the test set, the answer sites and the pages this answer comes from
    // stayed out of the search, and no page from them was read.
    const excluded = [...ANSWER_SITES, ...(known?.references ?? []).map(hostOf)];
    const started = example.events.find((e) => e.type === "started");
    expect(started?.excludeDomains).toEqual(expect.arrayContaining(excluded));
    const isExcluded = (host: string) => excluded.some((d) => host === d || host.endsWith(`.${d}`));
    const readHosts = example.events.flatMap((e) =>
      e.type === "page_read" ? [e.host] : e.type === "node_added" ? [e.node.host] : [],
    );
    expect(readHosts.filter(isExcluded)).toEqual([]);
  });
});

describe("case log format", () => {
  const { caseId, ranAt, events } = CASES[0];
  const saved = { caseId, ranAt, events };

  it("reads a log with or without the commit that ran it", () => {
    expect(parseCaseLog(saved).code).toBeUndefined();
    // pnpm investigate writes null when the code isn't a git checkout.
    expect(parseCaseLog({ ...saved, code: null }).code).toBeNull();
    const code = { commit: "5eb0796", changes: null };
    expect(parseCaseLog({ ...saved, code }).code).toEqual(code);
  });
});
