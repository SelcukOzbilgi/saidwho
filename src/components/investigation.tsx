"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun, type RunState } from "../lib/run-state";
import { readRunStream } from "../lib/run-stream";
import { QuoteForm, type QuoteRequest } from "./quote-form";
import { RunView } from "./run-view";

// What went wrong, keyed by the codes POST /api/investigate returns, plus a few
// the page finds on its own.
const PROBLEMS: Record<string, string> = {
  invalid_request: "Both the quote and the name are needed: up to 500 and 200 characters.",
  invalid_json: "The page sent something the server could not read. Reload and try again.",
  expected_json: "The page sent something the server could not read. Reload and try again.",
  body_too_large: "That's too long to look up.",
  byok_incomplete: "Both keys are needed: one for Nebius and one for Tavily.",
  trial_disabled: "Free trial runs are off right now. Use your own keys instead.",
  owner_keys_missing: "Free trial runs are not set up on this server. Use your own keys instead.",
  daily_budget_spent: "Today's free trial budget is spent. Use your own keys, or come back tomorrow.",
  server_misconfigured: "The server is not set up right. Try again later.",
  run_failed: "The run broke on the server. What it found so far is below.",
  connection_lost: "The connection dropped before the run finished. What it found so far is below.",
  unreachable: "Could not reach the server.",
};

type Status = "idle" | "running" | "finished" | "stopped" | "failed";
type Action = { type: "reset" } | { type: "event"; event: RunEvent };

const reducer = (state: RunState, action: Action): RunState =>
  action.type === "reset" ? initialRunState : reduceRun(state, action.event);

export function Investigation({ trialOpen }: { trialOpen: boolean }) {
  const [run, dispatch] = useReducer(reducer, initialRunState);
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Leaving the page ends the run, which stops the spend on the server too.
  useEffect(() => () => controller.current?.abort(), []);

  async function start(request: QuoteRequest) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: "reset" });
    setProblem(null);
    setStatus("running");

    // Only the latest run may touch the screen; a stopped one goes quiet.
    const live = () => controller.current === abort && !abort.signal.aborted;
    const stopped = () => {
      if (controller.current === abort) setStatus("stopped");
    };
    const fail = (code: string) => {
      setProblem(code);
      setStatus("failed");
    };
    let heard = false;

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
      if (!response.ok || !response.body) {
        const body: unknown = await response.json().catch(() => null);
        if (!live()) return stopped();
        const code = body && typeof body === "object" && "error" in body ? String(body.error) : "unreachable";
        return fail(code in PROBLEMS ? code : "unreachable");
      }

      let done = false;
      for await (const item of readRunStream(response.body)) {
        if (!live()) break;
        if (item.kind === "run_failed") return fail("run_failed");
        heard = true;
        if (item.event.type === "done") done = true;
        dispatch({ type: "event", event: item.event });
      }
      if (done) setStatus("finished");
      else if (live()) fail("connection_lost");
      else stopped();
    } catch {
      if (abort.signal.aborted) stopped();
      else if (controller.current === abort) fail(heard ? "connection_lost" : "unreachable");
    }
  }

  const running = status === "running";
  const started = status !== "idle";

  return (
    <div className="flex flex-col gap-10">
      <div className="rounded-2xl border border-line bg-card/60 p-5 shadow-sm sm:p-6">
        <QuoteForm trialOpen={trialOpen} running={running} onStart={start} onStop={() => controller.current?.abort()} />
      </div>

      {problem && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
          {PROBLEMS[problem]}
        </p>
      )}

      {started && run.quote && (
        <RunView
          run={run}
          running={running}
          note={
            status === "stopped" && (
              <p className="text-sm text-muted">You stopped the run. What it found so far is below.</p>
            )
          }
        />
      )}
    </div>
  );
}
