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
  invalid_request:
    "Check what you entered: a quote of up to 500 characters, a name of up to 200 if you add one, and keys (up to 512 characters) or an access code (up to 200) in plain keyboard characters with no spaces.",
  invalid_json: "The page sent something the server could not read. Reload and try again.",
  expected_json: "The page sent something the server could not read. Reload and try again.",
  body_too_large: "That's too long to look up.",
  byok_incomplete: "Both keys are needed: one for Nebius and one for Tavily.",
  trial_disabled: "Free trial runs are off right now. Use your own keys instead.",
  access_code_required: "The free trial needs an access code. Add it above, or use your own keys.",
  access_code_wrong: "That access code isn't right. Check it and try again, or use your own keys.",
  owner_keys_missing: "Free trial runs are not set up on this server. Use your own keys instead.",
  daily_budget_spent: "Today's free trial budget is spent. Use your own keys, or come back tomorrow.",
  too_many_runs: "That's a lot of runs from your network in the last hour. Try again a little later.",
  trial_limit_reached: "You've used today's free trial runs. Use your own keys, or come back tomorrow.",
  limits_unavailable: "Free trial runs can't start right now. Use your own keys, or try again later.",
  server_misconfigured: "The server is not set up right. Try again later.",
  run_failed: "The run broke on the server. What it found so far is below.",
  connection_lost: "The connection dropped before the run finished. What it found so far is below.",
  unreachable: "Could not reach the server.",
};

type Status = "idle" | "running" | "finished" | "stopped" | "failed";

// A stopped run is saved once the calls it had running finish, which can take
// up to a minute and a half (NEBIUS_TIMEOUT_MS), and the save itself up to ten
// seconds more. Its stream is closed by then, so the page checks every few
// seconds, for two minutes, whether the run's page exists, and links to it once
// it does.
const SAVE_CHECKS = 40;
const SAVE_CHECK_MS = 3_000;

async function waitForSave(id: string, current: () => boolean, onSaved: (id: string) => void): Promise<void> {
  for (let i = 0; i < SAVE_CHECKS; i++) {
    await new Promise((resolve) => setTimeout(resolve, SAVE_CHECK_MS));
    if (!current()) return;
    const res = await fetch(`/runs/${id}`, { method: "HEAD", cache: "no-store" }).catch(() => null);
    if (!current()) return;
    if (res?.ok) return onSaved(id);
  }
}
type Action = { type: "reset" } | { type: "event"; event: RunEvent };

const reducer = (state: RunState, action: Action): RunState =>
  action.type === "reset" ? initialRunState : reduceRun(state, action.event);

export function Investigation({
  trialOpen,
  needsCode,
  savesRuns,
}: {
  trialOpen: boolean;
  needsCode: boolean;
  savesRuns: boolean;
}) {
  const [run, dispatch] = useReducer(reducer, initialRunState);
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);
  // The id of the run's public page, once the server has saved it.
  const [savedId, setSavedId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  // Leaving the page ends the run, which stops the spend on the server too.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  async function start(request: QuoteRequest) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: "reset" });
    setProblem(null);
    setSavedId(null);
    setStatus("running");

    // Only the latest run may touch the screen; a stopped one goes quiet.
    const live = () => controller.current === abort && !abort.signal.aborted;
    // The id the server will save this run under, when it saves runs.
    let runId: string | null = null;
    const stopped = () => {
      if (controller.current !== abort) return;
      setStatus("stopped");
      if (runId) void waitForSave(runId, () => mounted.current && controller.current === abort, setSavedId);
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
      let broke = false;
      for await (const item of readRunStream(response.body)) {
        if (!live()) break;
        // A run that broke is still saved, and its id comes after, so reading goes on.
        if (item.kind === "run_failed") {
          broke = true;
          continue;
        }
        if (item.kind === "run") {
          runId = item.id;
          continue;
        }
        if (item.kind === "saved") {
          setSavedId(item.id);
          continue;
        }
        heard = true;
        if (item.event.type === "done") done = true;
        dispatch({ type: "event", event: item.event });
      }
      if (broke && live()) fail("run_failed");
      else if (done) setStatus("finished");
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
      <div className="rounded-sm border border-line bg-card/60 p-5 shadow-sm sm:p-6">
        <QuoteForm
          trialOpen={trialOpen}
          needsCode={needsCode}
          savesRuns={savesRuns}
          running={running}
          onStart={start}
          onStop={() => controller.current?.abort()}
        />
      </div>

      {problem && (
        <p role="alert" className="rounded-sm border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
          {PROBLEMS[problem]}
        </p>
      )}

      {started && run.quote && (
        <RunView
          run={run}
          running={running}
          announce
          note={
            <>
              {status === "stopped" && <p className="text-sm text-muted">You stopped the run. What it found so far is below.</p>}
              {savedId && <SavedLink id={savedId} />}
            </>
          }
        />
      )}
    </div>
  );
}

// The saved run's public page, to open or share.
function SavedLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/runs/${id}`;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">Saved. Anyone with this link can see the run:</span>
      <a href={`/runs/${id}`} className="font-mono text-xs underline underline-offset-4 hover:text-accent">
        {url}
      </a>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => {})}
        className="rounded-sm border border-line px-2 py-0.5 text-xs hover:border-foreground"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </p>
  );
}
