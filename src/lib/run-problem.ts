import type { Phase, ProviderTrouble, RunState } from "./run-state";

// What the run page says when a run can't start or ends badly: a short title,
// a plain line on what happened, and the ways forward. Pure, so every case is
// tested without a browser.

// What a way forward does. The page decides how each looks.
export type ProblemAction =
  // Open the form again on that key's field.
  | "fix_nebius"
  | "fix_tavily"
  // The same request again, through the same checks.
  | "retry"
  // Open the form again, on the visitor's own keys.
  | "own_keys"
  // Open the form again as it was.
  | "edit"
  // A case that has already run, free to look at.
  | "cases";

export type Problem = {
  tone: "bad" | "warn";
  title: string;
  text: string;
  // A few words for the run bar.
  short: string;
  actions: ProblemAction[];
  // The step the run broke at, when it wasn't the one it had reached.
  at?: Phase;
};

const PHASE_OF: Record<ProviderTrouble["step"], Phase> = {
  plan: "planning",
  search: "searching",
  read: "reading",
  trace: "tracing",
  judge: "judging",
};

export type PaidBy = "trial" | "byok";

const NEBIUS_KEYS = "tokenfactory.nebius.com";
const TAVILY_KEYS = "app.tavily.com";

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

// A run the server turned down before it started, by the code POST
// /api/investigate returned, or one the page found on its own (unreachable).
// retryAfter is the Retry-After header in seconds, when the server sent one.
export function refusal(code: string, retryAfter: number | null = null): Problem {
  const wait = retryAfter ? ` Try again in about ${minutes(retryAfter)} ${minutes(retryAfter) === 1 ? "minute" : "minutes"}.` : "";
  const bad = (title: string, text: string, actions: ProblemAction[], short = title): Problem => ({
    tone: "bad",
    title,
    text,
    short,
    actions,
  });
  const warn = (title: string, text: string, actions: ProblemAction[]): Problem => ({ tone: "warn", title, text, short: title, actions });
  switch (code) {
    case "invalid_request":
      return bad(
        "Something in the form can't be sent",
        "A quote can be up to 500 characters and a name up to 200. Keys and access codes are plain keyboard characters with no spaces.",
        [],
      );
    case "invalid_json":
    case "expected_json":
      return bad("The server couldn't read the request", "Reload the page and try again.", ["retry"]);
    case "body_too_large":
      return bad("That's too long to look up", "Shorten the quote to 500 characters or fewer.", []);
    case "byok_incomplete":
      return bad("Both keys are needed", "Add a Nebius key and a Tavily key. Each pays for its own part of the run.", []);
    case "trial_disabled":
    case "owner_keys_missing":
      return warn("Free trial runs are off here", "Use your own Nebius and Tavily keys, or open a finished case.", ["own_keys", "cases"]);
    case "access_code_required":
      return bad("The free trial needs an access code", "Add it in the field above, or use your own keys.", ["own_keys"]);
    case "access_code_wrong":
      return bad("That access code isn't right", "Check it for a missing character and try again, or use your own keys.", ["own_keys"]);
    case "daily_budget_spent":
      return warn("Today's free trial budget is spent", "It refills at midnight UTC. Your own keys work any time.", ["own_keys", "cases"]);
    case "trial_limit_reached":
      return warn("You've used today's free trial runs", "They come back at midnight UTC. Your own keys work any time.", ["own_keys", "cases"]);
    case "too_many_runs":
      return warn("That's a lot of runs from your network this hour", `The limit keeps the site up for everyone.${wait}`, ["cases"]);
    case "limits_unavailable":
      return warn("Free trial runs can't start right now", "The site can't count runs at the moment, so it starts none on its own keys. Your own keys still work.", ["own_keys", "retry"]);
    case "run_failed":
      return bad("The run broke on the server before it began", "Trying again usually works.", ["retry", "cases"]);
    case "connection_lost":
      return bad("The connection dropped before the run began", "Check your connection and try again.", ["retry"]);
    case "server_misconfigured":
      return bad("The server isn't set up right", "This one is on the site, not you. Try again later, or open a finished case.", ["cases"]);
    default:
      return bad("Couldn't reach the server", "Check your connection and try again.", ["retry", "cases"]);
  }
}

// Why a run that started ended without an answer, or null when it ended well
// or the verdict card says enough. status is how the page saw it end; code is
// set when the stream broke (run_failed, connection_lost).
export function runProblem(
  run: Pick<RunState, "verdict" | "stopped" | "trouble" | "searches">,
  { status, code, paidBy }: { status: "running" | "finished" | "stopped" | "failed"; code: string | null; paidBy: PaidBy },
): Problem | null {
  if (status === "running" || status === "stopped") return null;
  if (code === "run_failed") {
    return {
      tone: "bad",
      title: "The run broke on the server",
      text: "Something went wrong on our side partway through. What it found so far is below. Trying again usually works.",
      short: "broke on the server",
      actions: ["retry", "cases"],
    };
  }
  if (code === "connection_lost") {
    return {
      tone: "bad",
      title: "The connection dropped",
      text: "The page lost the server before the run finished, and the run stopped with it. What came in is below.",
      short: "connection dropped",
      actions: ["retry"],
    };
  }
  if (run.verdict) return null;

  const own = paidBy === "byok";
  const { nebius, tavily } = run.trouble;
  // A Nebius key that's refused or out of credit fails every model call, so the
  // run ends at its first one. On the trial the key is the site's.
  if (nebius?.kind === "auth") {
    return own
      ? {
          tone: "bad",
          title: "Nebius rejected your key",
          text: `${nebius.step === "plan" ? "The first model call was refused, so the run stopped before it spent anything." : "A model call was refused partway through, so the run stopped."} Copy the key again from ${NEBIUS_KEYS} and run it once more.`,
          short: "Nebius key rejected",
          actions: ["fix_nebius"],
          at: PHASE_OF[nebius.step],
        }
      : { ...siteKeyTrouble("Nebius"), at: PHASE_OF[nebius.step] };
  }
  if (nebius?.kind === "quota") {
    return own
      ? {
          tone: "bad",
          title: "Your Nebius account is out of credit",
          text: `Nebius refused the model calls for credit. Add some at ${NEBIUS_KEYS}, or use another key.`,
          short: "Nebius out of credit",
          actions: ["fix_nebius"],
          at: PHASE_OF[nebius.step],
        }
      : { ...siteKeyTrouble("Nebius"), at: PHASE_OF[nebius.step] };
  }
  // Searches that all failed leave nothing to read.
  if (tavily && run.searches === 0) {
    if (tavily.kind === "auth") {
      return own
        ? {
            tone: "bad",
            title: "Tavily rejected your key",
            text: `Every search was refused, so there were no pages to check. Copy the key again from ${TAVILY_KEYS} and run it once more.`,
            short: "Tavily key rejected",
            actions: ["fix_tavily"],
            at: "searching",
          }
        : { ...siteKeyTrouble("Tavily"), at: "searching" };
    }
    if (tavily.kind === "quota") {
      return own
        ? {
            tone: "bad",
            title: "Your Tavily key is out of credits",
            text: `Every search was refused for the plan's limit. Add credits at ${TAVILY_KEYS}, or use another key.`,
            short: "Tavily out of credits",
            actions: ["fix_tavily"],
            at: "searching",
          }
        : { ...siteKeyTrouble("Tavily"), at: "searching" };
    }
    if (tavily.kind === "rate_limit") return { ...slowDown("Tavily"), at: "searching" };
    return {
      tone: "bad",
      title: "Tavily didn't answer",
      text: "Every search failed on Tavily's side, so there were no pages to check. That's usually brief; try again in a minute.",
      short: "searches failed",
      actions: ["retry"],
      at: "searching",
    };
  }
  if (nebius?.kind === "rate_limit") return { ...slowDown("Nebius"), at: PHASE_OF[nebius.step] };
  if (run.stopped === "budget") {
    return {
      tone: "warn",
      title: "The run reached its spending cap",
      text: `A run stops at about ${own ? "$0.50" : "$0.10"} of model spend, so one quote can't run up a bill. This one got there before a verdict. What it found is below.`,
      short: "reached its spending cap",
      actions: ["edit", "cases"],
    };
  }
  // Stopped without the visitor pressing Stop: the server's time limit.
  if (run.stopped === "aborted") {
    return {
      tone: "warn",
      title: "The run reached its time limit",
      text: "A run gets about three minutes, and this one needed longer. What it found is below. A shorter or more distinctive part of the quote often goes faster.",
      short: "reached its time limit",
      actions: ["retry", "edit"],
    };
  }
  // The Judge's own call failing is the last step, so nothing else will say so.
  if (nebius?.step === "judge" && ["timeout", "upstream", "network", "unknown"].includes(nebius.kind)) {
    return {
      tone: "bad",
      title: "Nebius didn't answer the Judge",
      text: "The pages were read and checked, but the final call timed out or failed on Nebius's side. That's usually brief; try again.",
      short: "the Judge's call failed",
      actions: ["retry"],
    };
  }
  return null;
}

function siteKeyTrouble(provider: "Nebius" | "Tavily"): Problem {
  return {
    tone: "bad",
    title: `The site's ${provider} key isn't working`,
    text: "This one is on us, not you. Use your own keys, or open a finished case.",
    short: `site's ${provider} key failed`,
    actions: ["own_keys", "cases"],
  };
}

function slowDown(provider: "Nebius" | "Tavily"): Problem {
  return {
    tone: "warn",
    title: `${provider} asked the run to slow down`,
    text: `Too many requests reached ${provider} in a short time, so it turned some away. Wait a minute and try again.`,
    short: `${provider} rate limit`,
    actions: ["retry"],
  };
}
