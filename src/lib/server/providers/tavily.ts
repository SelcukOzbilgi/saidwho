import "server-only";

import {
  tavily,
  type TavilyExtractOptions,
  type TavilyExtractResponse,
  type TavilySearchOptions,
  type TavilySearchResponse,
} from "@tavily/core";

import { type SafeProviderError, toSafeError } from "../safe-error";
import { assertNoSdkEnvOverrides, normalizeApiKey } from "./sdk-guards";

type Result<T> = { ok: true; data: T; latencyMs: number } | { ok: false; error: SafeProviderError; latencyMs: number };

export type TavilyClient = {
  readonly search: (query: string, options?: TavilySearchOptions) => Promise<Result<TavilySearchResponse>>;
  readonly extract: (urls: string[], options?: TavilyExtractOptions) => Promise<Result<TavilyExtractResponse>>;
};

// How long a search may take before it gives up. A live run's deadline counts on
// it (RUN_DEADLINE_MS in investigate-handler.ts), so it is set here rather than
// left to the SDK's default, and a caller can't drop it. The SDK takes seconds.
export const TAVILY_TIMEOUT_MS = 60_000;

// The SDK's timeout is axios's socket idle timeout: it ends a response that
// stalls, not one that keeps sending a byte now and then. This race stops the
// wait at the timeout either way. The SDK takes no abort signal, so the request
// itself is not cancelled, only no longer waited for.
function withTimeout<T>(call: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000} seconds.`)), ms);
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

// @tavily/core falls back to process.env.TAVILY_API_KEY when apiKey is empty,
// and to an anonymous "keyless" mode when that is unset too. A BYOK request with
// a blank key must never end up on the owner's key, so a blank key is rejected here.
export function createTavilyClient({ apiKey }: { apiKey: string }): TavilyClient {
  const key = normalizeApiKey(apiKey, "Tavily");
  assertNoSdkEnvOverrides();
  const sdk = tavily({ apiKey: key });

  async function run<T>(call: () => Promise<T>): Promise<Result<T>> {
    const started = performance.now();
    try {
      const data = await call();
      return { ok: true, data, latencyMs: Math.round(performance.now() - started) };
    } catch (err: unknown) {
      return {
        ok: false,
        error: toSafeError("tavily", err, [key]),
        latencyMs: Math.round(performance.now() - started),
      };
    }
  }

  return {
    search: (query, options) =>
      run(() =>
        withTimeout(
          sdk.search(query, { includeUsage: true, ...options, timeout: TAVILY_TIMEOUT_MS / 1000 }),
          TAVILY_TIMEOUT_MS,
        ),
      ),
    extract: (urls, options) => run(() => sdk.extract(urls, { includeUsage: true, ...options })),
  };
}
