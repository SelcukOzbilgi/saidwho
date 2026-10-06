import "server-only";

import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

import { type SafeProviderError, toSafeError } from "../safe-error";
import { assertAllowedBaseUrl, assertNoSdkEnvOverrides, normalizeApiKey } from "./sdk-guards";

export type NebiusClient = {
  readonly chat: (params: ChatParams) => Promise<ChatResult>;
  readonly listModels: () => Promise<{ ok: true; ids: string[] } | { ok: false; error: SafeProviderError }>;
};

// Nebius accepts extra fields such as chat_template_kwargs on top of the OpenAI shape.
export type ChatParams = ChatCompletionCreateParamsNonStreaming & Record<string, unknown>;

export type ChatResult =
  | { ok: true; completion: ChatCompletion; latencyMs: number }
  | { ok: false; error: SafeProviderError; latencyMs: number };

export type NebiusClientOptions = {
  apiKey: string;
  baseURL: string;
  timeoutMs?: number;
};

// The key is always passed explicitly (owner key or a visitor's BYOK key), and
// every OpenAI-specific setting is pinned so nothing is read from OPENAI_* vars.
// Retries are off: a retried completion is billed twice; callers decide.
export function createNebiusClient({ apiKey, baseURL, timeoutMs = 120_000 }: NebiusClientOptions): NebiusClient {
  const key = normalizeApiKey(apiKey, "Nebius");
  assertAllowedBaseUrl(baseURL);
  assertNoSdkEnvOverrides();
  const sdk = new OpenAI({
    apiKey: key,
    baseURL,
    organization: null,
    project: null,
    adminAPIKey: null,
    webhookSecret: null,
    logLevel: "off",
    timeout: timeoutMs,
    maxRetries: 0,
  });

  return {
    chat: async (params) => {
      const started = performance.now();
      try {
        const completion = await sdk.chat.completions.create(params);
        return { ok: true, completion, latencyMs: Math.round(performance.now() - started) };
      } catch (err: unknown) {
        return {
          ok: false,
          error: toSafeError("nebius", err, [key]),
          latencyMs: Math.round(performance.now() - started),
        };
      }
    },
    listModels: async () => {
      try {
        const ids: string[] = [];
        for await (const model of sdk.models.list()) ids.push(model.id);
        return { ok: true, ids };
      } catch (err: unknown) {
        return { ok: false, error: toSafeError("nebius", err, [key]) };
      }
    },
  };
}
