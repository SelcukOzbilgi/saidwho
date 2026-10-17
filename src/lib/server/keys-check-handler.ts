import "server-only";

import { z } from "zod";

import { clientIp, visitorKey } from "./client-ip";
import type { ServerEnv } from "./env-schema";
import { apiKey, readJsonBody } from "./investigate-request";
import { assertAllowedBaseUrl } from "./providers/sdk-guards";
import { HOUR_SECONDS, type Limit, type RateLimiter, secondsLeftInWindow } from "./rate-limit";
import { redactSecrets } from "./safe-error";

// POST /api/keys/check: asks Nebius and Tavily whether a visitor's own keys
// work, before a run spends anything. Each key comes back as one of three
// states. "rejected" is only ever the provider saying no to the key (401 or
// 403); a timeout, a network error, a rate limit or a provider error is
// "unknown", since the key may well be fine. Neither call costs a credit:
// Nebius lists its models, and Tavily bills search, extract, crawl, map and
// research, not its usage page. The trial's access code is never checked here:
// a check without a run's count behind it would make guessing it cheap.

export type KeyState = "works" | "rejected" | "unknown";
export type KeyCheck = { state: KeyState };
// creditsLeft is null when the key and its plan have no limit, or Tavily didn't say.
export type TavilyKeyCheck = KeyCheck & { creditsLeft?: number | null };
export type KeysCheckResponse = { nebius?: KeyCheck; tavily?: TavilyKeyCheck };

export const TAVILY_USAGE_URL = "https://api.tavily.com/usage";
// Long enough for a slow provider, short enough that a run isn't held up for long.
export const KEY_CHECK_TIMEOUT_MS = 5_000;
// The form checks a key when it's pasted or left and once more before a run, so
// an honest visitor makes a handful an hour. The cap keeps the route from being
// used to try keys in bulk; it has its own count, so checks never use up runs.
export const KEY_CHECKS_PER_IP_PER_HOUR = 40;
const MAX_BODY_BYTES = 2_000;

const keysCheckSchema = z
  .strictObject({ nebiusApiKey: apiKey, tavilyApiKey: apiKey })
  .refine((body) => Boolean(body.nebiusApiKey || body.tavilyApiKey), { message: "no key to check" });

export type KeysCheckDeps = {
  env: ServerEnv;
  limiter: RateLimiter;
  fetch?: typeof fetch;
  logError?: (message: string) => void;
  timeoutMs?: number;
};

// Fixed codes only; nothing the visitor sent or a provider said goes back.
const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

const stateOf = (status: number): KeyState =>
  status >= 200 && status < 300 ? "works" : status === 401 || status === 403 ? "rejected" : "unknown";

// Tavily's usage page, read loosely: a field it drops or renames costs the
// credits line, never the check. Both the key and the plan can have a limit;
// the smaller of what's left is what a run can use.
const usageSchema = z.object({
  key: z.object({ usage: z.number(), limit: z.number().nullable() }).partial().optional(),
  account: z.object({ plan_usage: z.number(), plan_limit: z.number().nullable() }).partial().optional(),
});

export function creditsLeft(body: unknown): number | null {
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) return null;
  const { key, account } = parsed.data;
  const left = [
    typeof key?.limit === "number" && typeof key.usage === "number" ? key.limit - key.usage : null,
    typeof account?.plan_limit === "number" && typeof account.plan_usage === "number"
      ? account.plan_limit - account.plan_usage
      : null,
  ].filter((n): n is number => n !== null);
  return left.length ? Math.max(0, Math.floor(Math.min(...left))) : null;
}

export function createKeysCheckHandler(deps: KeysCheckDeps): (request: Request) => Promise<Response> {
  const logError = deps.logError ?? ((message: string) => console.error(message));
  const send = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? KEY_CHECK_TIMEOUT_MS;
  const limit: Limit = { name: "keys", max: KEY_CHECKS_PER_IP_PER_HOUR, windowSeconds: HOUR_SECONDS };

  // One GET with the key as a bearer token. Redirects are refused, so the key
  // only ever goes to the host named here.
  const ask = (url: URL | string, key: string) =>
    send(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });

  const checkNebius = async (key: string): Promise<KeyCheck> => {
    // The same pinned host a run uses; a base URL without its last slash would
    // otherwise lose its /v1.
    assertAllowedBaseUrl(deps.env.NEBIUS_BASE_URL);
    const base = deps.env.NEBIUS_BASE_URL.endsWith("/") ? deps.env.NEBIUS_BASE_URL : `${deps.env.NEBIUS_BASE_URL}/`;
    try {
      const res = await ask(new URL("models", base), key);
      // The model list itself isn't needed.
      await res.body?.cancel().catch(() => {});
      return { state: stateOf(res.status) };
    } catch {
      return { state: "unknown" };
    }
  };

  const checkTavily = async (key: string): Promise<TavilyKeyCheck> => {
    try {
      const res = await ask(TAVILY_USAGE_URL, key);
      const state = stateOf(res.status);
      if (state !== "works") {
        await res.body?.cancel().catch(() => {});
        return { state };
      }
      const body: unknown = await res.json().catch(() => null);
      return { state, creditsLeft: creditsLeft(body) };
    } catch {
      return { state: "unknown" };
    }
  };

  return async function POST(request: Request): Promise<Response> {
    const body = await readJsonBody(request, MAX_BODY_BYTES);
    if (!body.ok) return reply(body.status, { error: body.error });
    const parsed = keysCheckSchema.safeParse(body.json);
    if (!parsed.success) return reply(400, { error: "invalid_request" });
    const { nebiusApiKey, tavilyApiKey } = parsed.data;
    const secrets = [nebiusApiKey, tavilyApiKey];

    // Counted before any provider is asked, so a refused check asks no one.
    const visitor = visitorKey(clientIp(request.headers, deps.env.VERCEL === "1"));
    let counted: number | null;
    try {
      counted = await deps.limiter.hit(visitor, limit);
    } catch (err: unknown) {
      const message = err instanceof Error ? `${err.name}: ${redactSecrets(err.message, secrets)}` : "unknown";
      logError(`keys-check: could not count the check: ${message.slice(0, 300)}`);
      // Without a count the route would be open to bulk tries, so it answers
      // nothing. The form reads this as "could not check" and lets a run go.
      return reply(503, { error: "limits_unavailable" });
    }
    if (counted === null) {
      return reply(429, { error: "too_many_checks" }, { "Retry-After": String(secondsLeftInWindow(limit.windowSeconds)) });
    }

    let nebius: KeyCheck | undefined;
    let tavily: TavilyKeyCheck | undefined;
    try {
      [nebius, tavily] = await Promise.all([
        nebiusApiKey ? checkNebius(nebiusApiKey) : undefined,
        tavilyApiKey ? checkTavily(tavilyApiKey) : undefined,
      ]);
    } catch (err: unknown) {
      // Only server setup throws here (a Nebius base URL off the pinned host).
      const message = err instanceof Error ? redactSecrets(err.message, secrets) : "unknown";
      logError(`keys-check: ${message.slice(0, 300)}`);
      return reply(500, { error: "server_misconfigured" });
    }
    const result: KeysCheckResponse = { ...(nebius && { nebius }), ...(tavily && { tavily }) };
    return reply(200, result);
  };
}
