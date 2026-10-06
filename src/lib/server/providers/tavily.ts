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
    search: (query, options) => run(() => sdk.search(query, { includeUsage: true, ...options })),
    extract: (urls, options) => run(() => sdk.extract(urls, { includeUsage: true, ...options })),
  };
}
