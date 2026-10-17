"use client";

import { Check, Copy, Square } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useReducer, useRef, useState } from "react";

import type { RunEvent } from "../agent/events";
import { type PaidBy, type Problem, type ProblemAction, refusal, runProblem } from "../lib/run-problem";
import { initialRunState, reduceRun, type RunState } from "../lib/run-state";
import { readRunStream } from "../lib/run-stream";
import { cn } from "../lib/utils";
import { CaseLinks, QuoteForm, type QuoteFormHandle, type QuoteRequest } from "./quote-form";
import { ProblemCard } from "./problem-card";
import { RunView } from "./run-view";

// Codes the page finds on its own, on top of the ones POST /api/investigate
// returns; refusal() and runProblem() in lib/run-problem.ts say what each means.
const PAGE_CODES = new Set(["run_failed", "connection_lost", "unreachable"]);

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
  // Why the run couldn't start or broke off, as a code, and how long the
  // server asked the visitor to wait, when it did.
  const [problem, setProblem] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // The id of the run's public page, once the server has saved it.
  const [savedId, setSavedId] = useState<string | null>(null);
  // The form, opened again under a run that has ended.
  const [editing, setEditing] = useState(false);
  // "Try again" waiting on the key checks a run starts with, which can take a
  // few seconds while the form is hidden.
  const [retrying, setRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const top = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const problemLine = useRef<HTMLElement>(null);
  const form = useRef<QuoteFormHandle>(null);
  // What to do once the form opens again from a way forward under a run, in
  // place of putting the cursor in the quote.
  const onReopen = useRef<(() => void) | null>(null);

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
    setRetryAfter(null);
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
        const wait = Number(response.headers.get("retry-after"));
        if (Number.isFinite(wait) && wait > 0) setRetryAfter(wait);
        return fail(PAGE_CODES.has(code) ? "unreachable" : code);
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
    if (!wasOpen.current && formOpen) {
      const then = onReopen.current;
      onReopen.current = null;
      if (then) then();
      else top.current?.querySelector("textarea")?.focus({ preventScroll: true });
    }
    wasOpen.current = formOpen;
  }, [formOpen]);

  // How the run ended, said plainly, once it has.
  const ended = shown ? runProblem(run, { status, code: problem, paidBy }) : null;
  // A run that ended on a refused key marks that field, so the form says which
  // key to fix when it opens again.
  const refusedKey = ended?.actions.includes("fix_nebius") ? "nebius" : ended?.actions.includes("fix_tavily") ? "tavily" : null;
  useEffect(() => {
    if (refusedKey && run.trouble[refusedKey]?.kind === "auth") form.current?.markRejected(refusedKey);
  }, [refusedKey, run.trouble]);

  // The ways forward under a problem. One that changes the form opens it first.
  const act = (action: ProblemAction) => {
    // Read from the ref, not this render: "Try again" reopens seconds later,
    // and the visitor may have opened the form themselves by then.
    const reopen = (then: () => void) => {
      if (wasOpen.current) return then();
      onReopen.current = then;
      setEditing(true);
    };
    const toQuote = () => top.current?.querySelector("textarea")?.focus({ preventScroll: true });
    if (action === "fix_nebius" || action === "fix_tavily") {
      const name = action === "fix_nebius" ? "nebius" : "tavily";
      reopen(() => form.current?.focusKey(name));
    } else if (action === "own_keys") reopen(() => form.current?.useOwnKeys());
    else if (action === "edit") reopen(toQuote);
    else if (action === "retry" && form.current && !retryInFlight.current) {
      retryInFlight.current = true;
      // Shown only if the checks take a moment, so a run that starts at once
      // (the trial, keys already checked) doesn't flash it.
      const slow = setTimeout(() => setRetrying(true), 150);
      void form.current
        .resubmit()
        .then((sent) => {
          if (!mounted.current) return;
          // A key refused in the check before the run, or a form no longer ready
          // to run, can't say so from under a run: the form opens on what to fix.
          if (sent.outcome === "refused") reopen(() => form.current?.focusKey(sent.key));
          else if (sent.outcome === "not_ready") reopen(() => (sent.key ? form.current?.focusKey(sent.key) : toQuote()));
        })
        .finally(() => {
          retryInFlight.current = false;
          clearTimeout(slow);
          if (mounted.current) setRetrying(false);
        });
    }
  };
  const card = (p: Problem, eyebrow: string, ref?: React.Ref<HTMLElement>) => (
    <ProblemCard ref={ref} problem={p} eyebrow={eyebrow} onAction={act} busy={retrying ? "retry" : null} />
  );

  // A run turned down at the door leaves the form up and the button in focus,
  // with the reason under the form, maybe below the fold. Bring it into view.
  useEffect(() => {
    if (problem && formOpen) problemLine.current?.scrollIntoView({ block: "nearest" });
  }, [problem, formOpen]);

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
            ref={form}
            trialOpen={trialOpen}
            needsCode={needsCode}
            savesRuns={savesRuns}
            running={running}
            onStart={start}
            onStop={() => controller.current?.abort()}
          />
        </div>

        {problem && !shown && (
          <div className="arrive">{card(refusal(problem, retryAfter), "The run didn't start", problemLine)}</div>
        )}

        {status === "stopped" && !shown && <p className="arrive text-sm text-muted">You stopped the run before it began.</p>}
      </div>

      {/* The bar and the run share one box, so the bar can stay stuck under
          the site header for as long as the run runs down the page. */}
      {shown && (
        <div className="flex flex-col gap-6">
          <RunBar
            ref={bar}
            status={status}
            ended={ended}
            paidBy={paidBy}
            editing={editing}
            onStop={() => controller.current?.abort()}
            onAgain={() => setEditing(true)}
          />
          <RunView
            run={run}
            running={running}
            announce
            problem={
              ended
                ? {
                    card: card(ended, ended.tone === "warn" ? "Stopped early" : "Ended early"),
                    tone: ended.tone,
                    at: ended.at ?? run.phase,
                  }
                : undefined
            }
            note={
              <>
                {status === "stopped" && <p className="text-sm text-muted">You stopped the run. What it found so far is below.</p>}
                {savedId && <SavedLink id={savedId} />}
              </>
            }
          />
        </div>
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
  ended,
  paidBy,
  editing,
  onStop,
  onAgain,
}: {
  ref: React.Ref<HTMLDivElement>;
  status: Status;
  ended: Problem | null;
  paidBy: PaidBy;
  editing: boolean;
  onStop: () => void;
  onAgain: () => void;
}) {
  // A run can finish and still have ended badly (its key refused, its cap hit):
  // the bar then says so, in the problem's own color.
  const { word, dot } = ended
    ? { word: ended.tone === "bad" ? "Ended early" : "Stopped early", dot: ended.tone === "bad" ? "bg-bad" : "bg-warn" }
    : STATUS[status];
  const running = status === "running";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label="This run"
      className="arrive sticky top-[calc(var(--site-header-height,3.5rem)+0.5rem)] z-20 flex items-center gap-3 rounded-sm border border-line bg-card px-4 py-3 shadow-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      {/* The dot rings once when the run ends badly, keyed so it rings again for a new run. */}
      <span
        aria-hidden="true"
        key={ended ? "ended" : "live"}
        data-ended={ended ? ended.tone : undefined}
        className={cn("run-dot relative size-2.5 shrink-0 rounded-full transition-colors duration-300", dot)}
      />
      {/* No live region here: the run's log already reads each step aloud, and a problem card is an alert. */}
      <p className="min-w-0 text-sm">
        <span className="font-medium">{word}</span>
        {ended && <span className="text-muted"> · {ended.short}</span>}
        <span className="text-muted max-sm:hidden"> · {paidBy === "trial" ? "on the free trial" : "on your own keys"}</span>
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
