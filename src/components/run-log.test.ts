import { describe, expect, it } from "vitest";

import { initialRunState, reduceRun } from "../lib/run-state";
import { CASES } from "../cases/cases";
import { AGENT_ROLE, callCost } from "./run-log";

describe("callCost", () => {
  it("never shows a paid call as free", () => {
    expect(callCost(0.00002)).toBe("<$0.0001");
    expect(callCost(0)).toBe("$0.0000");
    expect(callCost(0.0037)).toBe("$0.0037");
  });
});

describe("AGENT_ROLE", () => {
  it("explains every name a saved run's log shows", () => {
    for (const { caseId, events } of CASES) {
      const { log } = events.reduce(reduceRun, initialRunState);
      for (const { agent } of log) expect(AGENT_ROLE[agent], `${caseId}: ${agent}`).toBeTruthy();
    }
  });
});
