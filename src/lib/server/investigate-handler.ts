import "server-only";

import type { RunEvent } from "../../agent/events";
import type { InvestigationOptions } from "../../agent/orchestrator";
import { clientIp, UNKNOWN_VISITOR, visitorKey } from "./client-ip";
import type { DailyLedger, Reservation } from "./daily-budget";
import { TAVILY_USD_PER_CREDIT } from "./daily-budget";
import type { ServerEnv } from "./env-schema";
import { parseInvestigateRequest } from "./investigate-request";
import type { NebiusClient, NebiusClientOptions } from "./providers/nebius";
import type { TavilyClient } from "./providers/tavily";
import { DAY_SECONDS, HOUR_SECONDS, type Limit, type RateLimiter, secondsLeftInWindow } from "./rate-limit";
import { resolveRunKeys } from "./run-keys";
import { newRunId, type RunStore } from "./run-store";
import { redactSecrets } from "./safe-error";
import { SSE_HEADERS, SSE_HEARTBEAT, SSE_RUN_FAILED, toRunIdChunk, toSavedChunk, toSseChunk } from "./sse";

// POST /api/investigate: checks the request, picks whose keys pay, and streams
// the orchestrator's events back as server-sent events. When the run ends, it is
// saved and the stream gets its id. Every dependency is passed in, so tests run
// the whole handler with fake providers.

// Estimated Nebius spend after which a run starts no new model call. A visitor's
// own key gets the same limit as the command-line script; the owner's trial key
// gets less.
export const BYOK_MAX_USD = 0.5;
export const TRIAL_MAX_USD = 0.1;
// What a trial run sets aside from the daily budget before it starts:
// - its Nebius limit ($0.10),
// - its searches at one credit each: five, and three a round for the
//   Genealogist's two rounds, eleven in all ($0.088),
// - calls already running when the limit is reached: up to five readers, or one
//   judge. The costliest is an Ultra judge: up to 16,000 output tokens ($0.048)
//   on a prompt of about 20,000 tokens at most ($0.02), since it holds at most
//   38 pages with four fields of up to 300 characters each, plus the quote and
//   the cited works.
// That comes to about $0.26. Five readers cost far less than one Ultra judge, and
// $0.30 leaves some margin.
export const TRIAL_RESERVE_USD = 0.3;
const HEARTBEAT_MS = 15_000;
// The route may run for 300 s (maxDuration). A run starts no new paid call after
// RUN_DEADLINE_MS, and a call already running gives up after NEBIUS_TIMEOUT_MS,
// so the stream still ends with a done event before the platform cuts it.
export const RUN_DEADLINE_MS = 200_000;
export const NEBIUS_TIMEOUT_MS = 90_000;

export type InvestigateDeps = {
  env: ServerEnv;
  ledger: DailyLedger;
  // Counts runs per visitor.
  limiter: RateLimiter;
  // Sites left out of every live run, so the agent finds the trail itself.
  excludeDomains: readonly string[];
  createNebius: (options: NebiusClientOptions) => NebiusClient;
  createTavily: (options: { apiKey: string }) => TavilyClient;
  investigate: (options: InvestigationOptions) => Promise<void>;
  // Where finished runs are saved; null when saving isn't set up.
  store?: RunStore | null;
  logError?: (message: string) => void;
  runDeadlineMs?: number;
};

// Error bodies carry a fixed code, never provider text or anything the visitor sent.
const fail = (
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response => Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });

const LIMIT_ERRORS = { runs: "too_many_runs", trial: "trial_limit_reached" } as const;

const KEY_ERRORS = {
  byok_incomplete: 400,
  trial_disabled: 403,
  owner_keys_missing: 503,
} as const;

type DoneEvent = Extract<RunEvent, { type: "done" }>;

const describe = (err: unknown, secrets: readonly string[]): string =>
  (err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets)}` : "unknown").slice(0, 300);

export function createInvestigateHandler(deps: InvestigateDeps): (request: Request) => Promise<Response> {
  const logError = deps.logError ?? ((message: string) => console.error(message));
  let warnedNoAddress = false;

  return async function POST(request: Request): Promise<Response> {
    const parsed = await parseInvestigateRequest(request);
    if (!parsed.ok) return fail(parsed.status, parsed.error, parsed.fields ? { fields: parsed.fields } : {});
    const { quote, popularAttribution, language, keys: keyRequest } = parsed.request;

    const resolved = resolveRunKeys(keyRequest, deps.env);
    if (!resolved.ok) return fail(KEY_ERRORS[resolved.reason], resolved.reason);
    const keys = resolved.keys;
    const secrets = [keys.nebiusApiKey, keys.tavilyApiKey];

    let nebius: NebiusClient;
    let tavily: TavilyClient;
    try {
      nebius = deps.createNebius({
        apiKey: keys.nebiusApiKey,
        baseURL: deps.env.NEBIUS_BASE_URL,
        timeoutMs: NEBIUS_TIMEOUT_MS,
      });
      tavily = deps.createTavily({ apiKey: keys.tavilyApiKey });
    } catch (err: unknown) {
      // Keys were checked by the request schema, so this is server setup (an SDK
      // override variable is set, say). The message never names a key, but is redacted anyway.
      const message = err instanceof Error ? redactSecrets(err.message, secrets) : "unknown";
      logError(`investigate: could not create provider clients: ${message.slice(0, 300)}`);
      return fail(500, "server_misconfigured");
    }

    const onVercel = deps.env.VERCEL === "1";
    const visitor = visitorKey(clientIp(request.headers, onVercel));
    if (onVercel && visitor === UNKNOWN_VISITOR && !warnedNoAddress) {
      // Once per server instance, and never with the headers themselves.
      warnedNoAddress = true;
      logError("investigate: Vercel gave no visitor address, so visitors without one share a count");
    }

    // The visitor is counted before the budget is touched, so a visitor at their
    // limit can't hold any of the day's budget, however many requests they send.
    // The scarcer trial limit goes first, so a visitor out of trial runs who keeps
    // trying doesn't use up their hourly runs on their own keys too.
    const limits: Limit[] = [{ name: "runs", max: deps.env.RUNS_PER_IP_PER_HOUR, windowSeconds: HOUR_SECONDS }];
    if (keys.source === "owner") {
      limits.unshift({ name: "trial", max: deps.env.TRIAL_RUNS_PER_IP_PER_DAY, windowSeconds: DAY_SECONDS });
    }
    // A run refused after it was counted gives its counts back, so a run that never
    // starts leaves the visitor's counts as they were. This is best effort: when it
    // fails the run is still refused, and the count stays until its window ends.
    const taken: Limit[] = [];
    const refuse = async (response: Response): Promise<Response> => {
      await Promise.all(
        taken.map(async (limit) => {
          try {
            await deps.limiter.unhit(visitor, limit);
          } catch (err: unknown) {
            logError(`investigate: could not give back the ${limit.name} count: ${describe(err, secrets)}`);
          }
        }),
      );
      return response;
    };
    for (const limit of limits) {
      let allowed: boolean;
      try {
        allowed = await deps.limiter.hit(visitor, limit);
      } catch (err: unknown) {
        logError(`investigate: could not check the ${limit.name} limit: ${describe(err, secrets)}`);
        // A trial run spends the owner's money, so without a working count none
        // starts. A run on the visitor's own keys costs the owner nothing, so a
        // broken count shouldn't block it. A count whose call failed may or may
        // not have been made, so it isn't given back.
        if (keys.source === "owner") return refuse(fail(503, "limits_unavailable"));
        continue;
      }
      if (!allowed) {
        const retryAfter = String(secondsLeftInWindow(limit.windowSeconds));
        return refuse(fail(429, LIMIT_ERRORS[limit.name], {}, { "Retry-After": retryAfter }));
      }
      taken.push(limit);
    }

    // The budget comes last, so nothing after it can refuse the run and leave a
    // reservation behind.
    let reservation: Reservation | null = null;
    if (keys.source === "owner") {
      try {
        reservation = await deps.ledger.reserve(TRIAL_RESERVE_USD);
      } catch (err: unknown) {
        // A trial run spends the owner's money, so without a working count none starts.
        logError(`investigate: could not check the daily budget: ${describe(err, secrets)}`);
        return refuse(fail(503, "limits_unavailable"));
      }
      if (!reservation) return refuse(fail(429, "daily_budget_spent"));
    }

    // One controller stops the run, whether the client disconnects (request.signal),
    // the stream is cancelled or the deadline passes. Model calls already running still finish.
    const abort = new AbortController();
    const stop = () => abort.abort();
    if (request.signal.aborted) stop();
    else request.signal.addEventListener("abort", stop, { once: true });
    const deadline = setTimeout(stop, deps.runDeadlineMs ?? RUN_DEADLINE_MS);

    const encoder = new TextEncoder();
    let closed = false;
    let done: DoneEvent | null = null;
    // Every event, kept for saving. A stopped or broken run is saved too, as far as it got.
    const events: RunEvent[] = [];
    // The id the run is saved under, when runs are saved.
    const runId = deps.store ? newRunId() : null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // The stream was closed under us; the run keeps going until its next check.
            closed = true;
          }
        };
        if (runId) send(toRunIdChunk(runId));
        heartbeat = setInterval(() => send(SSE_HEARTBEAT), HEARTBEAT_MS);

        deps
          .investigate({
            nebius,
            tavily,
            input: { quote, popularAttribution, language, excludeDomains: deps.excludeDomains },
            maxUsd: keys.source === "owner" ? TRIAL_MAX_USD : BYOK_MAX_USD,
            signal: abort.signal,
            onEvent: (event) => {
              if (event.type === "done") done = event;
              events.push(event);
              send(toSseChunk(event));
            },
          })
          .catch((err: unknown) => {
            logError(`investigate: run failed: ${describe(err, secrets)}`);
            send(SSE_RUN_FAILED);
          })
          .finally(async () => {
            clearInterval(heartbeat);
            clearTimeout(deadline);
            request.signal.removeEventListener("abort", stop);
            // When some spend is unknown (no done event, or calls that reported no
            // usage), the run counts as at least its whole reservation.
            const finished = done as DoneEvent | null;
            const counted = finished ? finished.nebiusUsd + finished.tavilyCredits * TAVILY_USD_PER_CREDIT : 0;
            const allKnown = finished !== null && finished.unknownCostCalls === 0;
            try {
              await reservation?.settle(allKnown ? counted : Math.max(counted, TRIAL_RESERVE_USD));
            } catch (err: unknown) {
              // The reservation then stays counted in full, which errs toward spending less.
              logError(`investigate: could not settle the daily budget: ${describe(err, secrets)}`);
            }
            // Saved before the stream closes: work left for after the response ends
            // may never run on a serverless platform. A run that ended before it
            // planned or searched anything, as one with a rejected key does, has
            // nothing to link to, and saving it would let anyone fill the table
            // with made-up keys.
            const gotGoing = events.some((e) => e.type === "planned" || e.type === "searched");
            if (deps.store && runId && gotGoing) {
              try {
                await deps.store.save({ id: runId, keys: keys.source === "owner" ? "trial" : "own", events });
                send(toSavedChunk(runId));
              } catch (err: unknown) {
                logError(`investigate: could not save the run: ${describe(err, secrets)}`);
              }
            }
            if (!closed) {
              closed = true;
              controller.close();
            }
          });
      },
      cancel() {
        closed = true;
        clearInterval(heartbeat);
        stop();
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });
  };
}
