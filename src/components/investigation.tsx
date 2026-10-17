"use client";

import { Check, Copy, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useReducer, useRef, useState } from "react";

import type { RunEvent } from "../agent/events";
import { initialRunState, reduceRun, type RunState } from "../lib/run-state";
import { readRunStream } from "../lib/run-stream";
import { cn } from "../lib/utils";
import { CaseLinks, QuoteForm, type QuoteRequest } from "./quote-form";
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
type PaidBy = QuoteRequest["keys"]["mode"];

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

// The order the page's parts come in as it opens (globals.css, Run page).
const order = (i: number) => ({ "--i": i }) as CSSProperties;

// The run page: the form, and the run in its place once one starts. The form
// stays mounted while it's hidden, so "Run another quote" brings back what was
// typed, keys included.
export function Investigation({
  trialOpen,
  needsCode,
  savesRuns,
  heading,
  intro,
}: {
  trialOpen: boolean;
  needsCode: boolean;
  savesRuns: boolean;
  // The page's h1, and a line under it.
  heading: ReactNode;
  intro?: ReactNode;
}) {
  const [run, dispatch] = useReducer(reducer, initialRunState);
  const [status, setStatus] = useState<Status>("idle");
  const [paidBy, setPaidBy] = useState<PaidBy>("byok");
  const [problem, setProblem] = useState<string | null>(null);
  // The id of the run's public page, once the server has saved it.
  const [savedId, setSavedId] = useState<string | null>(null);
  // The form, opened again under a run that has ended.
  const [editing, setEditing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const top = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);

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
    setPaidBy(request.keys.mode);
    setEditing(false);
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
  // A run with something to show. Until its first event the form stays, with
  // its own Stop button, so one the server turns down before it begins (a wrong
  // code, a spent budget) leaves the form in place for a fix.
  const shown = status !== "idle" && run.quote !== null;
  const formOpen = editing || !shown;

  // When the run takes the form's place, the page goes back up to it and the
  // keyboard lands on the bar, since the button it was on is gone.
  const wasOpen = useRef(formOpen);
  useEffect(() => {
    if (wasOpen.current && !formOpen) {
      top.current?.scrollIntoView({ block: "start" });
      bar.current?.focus({ preventScroll: true });
    }
    if (!wasOpen.current && formOpen) top.current?.querySelector("textarea")?.focus({ preventScroll: true });
    wasOpen.current = formOpen;
  }, [formOpen]);

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <header className="max-w-2xl">
        <div className="run-in" style={order(0)}>
          {heading}
        </div>
        {intro && (
          <p className="run-in mt-3 text-lg text-muted" style={order(1)}>
            {intro}
          </p>
        )}
        <CaseLinks className="run-in mt-5" style={order(2)} />
      </header>

      <div ref={top} className="flex scroll-mt-4 flex-col gap-6">
        <div hidden={!formOpen}>
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
          <p role="alert" className="arrive rounded-sm border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
            {PROBLEMS[problem]}
          </p>
        )}

        {shown && (
          <RunBar
            ref={bar}
            status={status}
            paidBy={paidBy}
            editing={editing}
            onStop={() => controller.current?.abort()}
            onAgain={() => setEditing(true)}
          />
        )}
      </div>

      {shown && (
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

const STATUS: Record<Status, { word: string; dot: string }> = {
  idle: { word: "", dot: "" },
  running: { word: "Running", dot: "bg-accent" },
  finished: { word: "Finished", dot: "bg-good" },
  stopped: { word: "Stopped", dot: "bg-muted" },
  failed: { word: "Ended early", dot: "bg-bad" },
};

// What the run is doing and the one thing to do about it: stop it while it
// goes, start another once it ends. It stays in reach under the site header
// while the run streams in below.
function RunBar({
  ref,
  status,
  paidBy,
  editing,
  onStop,
  onAgain,
}: {
  ref: React.Ref<HTMLDivElement>;
  status: Status;
  paidBy: PaidBy;
  editing: boolean;
  onStop: () => void;
  onAgain: () => void;
}) {
  const { word, dot } = STATUS[status];
  const running = status === "running";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-label="This run"
      className="arrive sticky top-[calc(var(--site-header-height,3.5rem)+0.5rem)] z-20 flex items-center gap-3 rounded-sm border border-line bg-card px-4 py-3 shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full transition-colors duration-300", dot)} />
      <p className="min-w-0 text-sm" role="status">
        <span className="font-medium">{word}</span>
        <span className="text-muted"> · {paidBy === "trial" ? "on the free trial" : "on your own keys"}</span>
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-2 rounded-sm border border-foreground px-3.5 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            <Square aria-hidden="true" className="size-3 fill-current" />
            Stop
          </button>
        ) : (
          !editing && (
            <button
              type="button"
              onClick={onAgain}
              className="rounded-sm bg-foreground px-3.5 py-1.5 text-sm font-medium text-background transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              Run another quote
            </button>
          )
        )}
      </div>
    </div>
  );
}

// The saved run's public page, to open or share. The copy button turns into a
// tick for a moment once the link is on the clipboard: the icon swap from
// uiable's Copy Link Button on 21st.dev.
function SavedLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const still = useReducedMotion() === true;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const url = `${window.location.origin}/runs/${id}`;
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2_000);
      },
      () => {},
    );
  const swap = still
    ? { initial: false as const, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, scale: 0.5 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.5 },
        transition: { duration: 0.15, ease: "easeOut" as const },
      };
  return (
    <p className="arrive flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">Saved. Anyone with this link can see the run:</span>
      <a href={`/runs/${id}`} className="font-mono text-xs underline underline-offset-4 hover:text-accent-ink">
        {url}
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-sm border border-line px-2 py-0.5 text-xs hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        <span className="relative grid size-3.5 place-items-center" aria-hidden="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={copied ? "tick" : "copy"} className="grid place-items-center" {...swap}>
              {copied ? <Check className="size-3.5 text-good" strokeWidth={2.5} /> : <Copy className="size-3.5" />}
            </motion.span>
          </AnimatePresence>
        </span>
        {copied ? "Copied" : "Copy link"}
      </button>
    </p>
  );
}
