import "server-only";

import type { RunEvent } from "../../agent/events";
import type { InvestigationOptions } from "../../agent/orchestrator";
import type { DailyLedger, Reservation } from "./daily-budget";
import { TAVILY_USD_PER_CREDIT } from "./daily-budget";
import type { ServerEnv } from "./env-schema";
import { parseInvestigateRequest } from "./investigate-request";
import type { NebiusClient, NebiusClientOptions } from "./providers/nebius";
import type { TavilyClient } from "./providers/tavily";
import { resolveRunKeys } from "./run-keys";
import { redactSecrets } from "./safe-error";
import { SSE_HEADERS, SSE_HEARTBEAT, SSE_RUN_FAILED, toSseChunk } from "./sse";

// POST /api/investigate: checks the request, picks whose keys pay, and streams
// the orchestrator's events back as server-sent events. Every dependency is
// passed in, so tests run the whole handler with fake providers.

// Estimated Nebius spend after which a run starts no new model call. A visitor's
// own key gets the same limit as the command-line script; the owner's trial key
// gets less.
export const BYOK_MAX_USD = 0.5;
export const TRIAL_MAX_USD = 0.1;
// What a trial run reserves from the daily budget before it starts: its Nebius
// limit, five searches at one credit each ($0.04), and the most one call can add
// after starting just under the limit. The largest is an Ultra second judge: up
// to 8,000 output tokens ($0.024) on a prompt of a few thousand tokens.
export const TRIAL_RESERVE_USD = 0.18;
const HEARTBEAT_MS = 15_000;
// The route may run for 300 s (maxDuration). A run starts no new paid call after
// RUN_DEADLINE_MS, and a call already running gives up after NEBIUS_TIMEOUT_MS,
// so the stream still ends with a done event before the platform cuts it.
export const RUN_DEADLINE_MS = 200_000;
export const NEBIUS_TIMEOUT_MS = 90_000;

export type InvestigateDeps = {
  env: ServerEnv;
  ledger: DailyLedger;
  // Sites left out of every live run, so the agent finds the trail itself.
  excludeDomains: readonly string[];
  createNebius: (options: NebiusClientOptions) => NebiusClient;
  createTavily: (options: { apiKey: string }) => TavilyClient;
  investigate: (options: InvestigationOptions) => Promise<void>;
  logError?: (message: string) => void;
  runDeadlineMs?: number;
};

// Error bodies carry a fixed code, never provider text or anything the visitor sent.
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Response =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

const KEY_ERRORS = {
  byok_incomplete: 400,
  trial_disabled: 403,
  owner_keys_missing: 503,
} as const;

type DoneEvent = Extract<RunEvent, { type: "done" }>;

export function createInvestigateHandler(deps: InvestigateDeps): (request: Request) => Promise<Response> {
  const logError = deps.logError ?? ((message: string) => console.error(message));

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

    let reservation: Reservation | null = null;
    if (keys.source === "owner") {
      reservation = deps.ledger.reserve(TRIAL_RESERVE_USD);
      if (!reservation) return fail(429, "daily_budget_spent");
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
              send(toSseChunk(event));
            },
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets)}` : "unknown";
            logError(`investigate: run failed: ${message.slice(0, 300)}`);
            send(SSE_RUN_FAILED);
          })
          .finally(() => {
            clearInterval(heartbeat);
            clearTimeout(deadline);
            request.signal.removeEventListener("abort", stop);
            // When some spend is unknown (no done event, or calls that reported no
            // usage), the run counts as at least its whole reservation.
            const finished = done as DoneEvent | null;
            const counted = finished ? finished.nebiusUsd + finished.tavilyCredits * TAVILY_USD_PER_CREDIT : 0;
            const allKnown = finished !== null && finished.unknownCostCalls === 0;
            reservation?.settle(allKnown ? counted : Math.max(counted, TRIAL_RESERVE_USD));
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
