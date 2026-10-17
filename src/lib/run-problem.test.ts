import { describe, expect, it } from "vitest";

import type { RunEvent } from "../agent/events";
import { refusal, runProblem } from "./run-problem";
import { initialRunState, reduceRun, type RunState } from "./run-state";

const STARTED: RunEvent = { type: "started", quote: "Q", popularAttribution: null, language: null, excludeDomains: [] };
const DONE: RunEvent = { type: "done", nebiusUsd: 0, tavilyCredits: 0, unknownCostCalls: 0, seconds: 2 };
const SPEND = { tier: "super", costUsd: 0, usageKnown: false, latencyMs: 10 } as const;
const PLANNED: RunEvent = { type: "planned", ...SPEND, usageKnown: true, variants: [], candidateAuthors: [], queries: ['"Q"', "Q origin"] };

const play = (...events: RunEvent[]): RunState => events.reduce(reduceRun, initialRunState);
const ended = (run: RunState, paidBy: "trial" | "byok" = "byok", code: string | null = null) =>
  runProblem(run, { status: code ? "failed" : "finished", code, paidBy });

describe("runProblem", () => {
  it("says Nebius rejected the visitor's key when the planner's call is refused, and points at that key", () => {
    const run = play(STARTED, { type: "plan_failed", ...SPEND, reason: "auth: The Nebius API key was rejected." }, DONE);
    expect(run.trouble.nebius).toEqual({ kind: "auth", step: "plan" });
    const problem = ended(run)!;
    expect(problem).toMatchObject({ tone: "bad", title: "Nebius rejected your key", actions: ["fix_nebius"] });
    expect(problem.text).toContain("before it spent anything");
  });

  it("blames the site, not the visitor, when the trial's own key is refused", () => {
    const run = play(STARTED, { type: "plan_failed", ...SPEND, reason: "auth: The Nebius API key was rejected." }, DONE);
    expect(ended(run, "trial")).toMatchObject({ title: "The site's Nebius key isn't working", actions: ["own_keys", "cases"] });
  });

  it("says Tavily rejected the key when every search was refused", () => {
    const failed = (query: string): RunEvent => ({ type: "search_failed", query, reason: "auth" });
    const run = play(STARTED, PLANNED, failed('"Q"'), failed("Q origin"), { type: "judge_skipped", reason: "no verified evidence" }, DONE);
    expect(ended(run)).toMatchObject({ title: "Tavily rejected your key", actions: ["fix_tavily"] });
  });

  it("leaves a run alone when only some searches failed and the rest found nothing", () => {
    const run = play(
      STARTED,
      PLANNED,
      { type: "searched", query: '"Q"', results: 0, credits: 1, latencyMs: 5 },
      { type: "search_failed", query: "Q origin", reason: "timeout" },
      { type: "judge_skipped", reason: "no verified evidence" },
      DONE,
    );
    expect(ended(run)).toBeNull();
  });

  it.each([
    ["quota", "Your Nebius account is out of credit"],
    ["rate_limit", "Nebius asked the run to slow down"],
  ])("names a Nebius %s plainly", (kind, title) => {
    const run = play(STARTED, { type: "plan_failed", ...SPEND, reason: `${kind}: message` }, DONE);
    expect(ended(run)?.title).toBe(title);
  });

  it("says the spending cap stopped the run, in a warning tone", () => {
    const run = play(STARTED, PLANNED, { type: "budget_exceeded", spentUsd: 0.5, maxUsd: 0.5 }, DONE);
    expect(ended(run)).toMatchObject({ tone: "warn", title: "The run reached its spending cap" });
    expect(ended(run)!.text).toContain("$0.50");
    expect(ended(run, "trial")!.text).toContain("$0.10");
  });

  it("tells the server's time limit from the visitor's own Stop", () => {
    const run = play(STARTED, PLANNED, { type: "aborted" }, DONE);
    expect(ended(run)?.title).toBe("The run reached its time limit");
    expect(runProblem(run, { status: "stopped", code: null, paidBy: "byok" })).toBeNull();
  });

  it("says the Judge's call failed when that's what left the run without a verdict", () => {
    const run = play(STARTED, PLANNED, { type: "judge_failed", ...SPEND, reason: "timeout: The provider did not respond in time." }, DONE);
    expect(ended(run)).toMatchObject({ title: "Nebius didn't answer the Judge", actions: ["retry"] });
  });

  it("names a broken stream whatever the run found, and says nothing over a verdict", () => {
    const run = play(STARTED, PLANNED);
    expect(ended(run, "byok", "run_failed")?.title).toBe("The run broke on the server");
    expect(ended(run, "byok", "connection_lost")?.title).toBe("The connection dropped");
    const judged = play(STARTED, PLANNED, {
      type: "verdict",
      ...SPEND,
      verdict: {
        verdict: "correct",
        confidence: "high",
        earliest_author: null,
        earliest_date: null,
        earliest_node: null,
        misattribution_node: null,
        rationale: "r",
      },
      unknownIds: [],
    } as RunEvent);
    expect(ended(judged)).toBeNull();
  });

  it("says nothing while a run is going", () => {
    expect(runProblem(play(STARTED), { status: "running", code: null, paidBy: "byok" })).toBeNull();
  });
});

describe("refusal", () => {
  it("gives every code the server sends a title and a way forward where there is one", () => {
    for (const code of ["daily_budget_spent", "trial_limit_reached", "trial_disabled", "access_code_wrong", "limits_unavailable"]) {
      const problem = refusal(code);
      expect(problem.title).not.toBe("Couldn't reach the server");
      expect(problem.actions.length).toBeGreaterThan(0);
    }
  });

  it("says how long to wait when the server said", () => {
    expect(refusal("too_many_runs", 1_500).text).toContain("about 25 minutes");
    expect(refusal("too_many_runs", 30).text).toContain("about 1 minute.");
    expect(refusal("too_many_runs").text).not.toContain("Try again in");
  });

  it("reads an unknown code as an unreachable server", () => {
    expect(refusal("something_new")).toMatchObject({ title: "Couldn't reach the server", actions: ["retry", "cases"] });
  });
});
