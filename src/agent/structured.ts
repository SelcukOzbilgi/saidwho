import { z } from "zod";

import type { NebiusClient } from "../lib/server/providers/nebius";
import type { ErrorKind } from "../lib/server/safe-error";
import { estimateCostUsd, type ModelSpec, type TokenUsage } from "./models";

export type StructuredRequest<S extends z.ZodType> = {
  model: ModelSpec;
  schema: S;
  name: string;
  system: string;
  user: string;
  // Thinking is on by default on Token Factory; short structured calls turn it off.
  thinking: boolean;
  maxTokens: number;
};

// Why a call failed: the provider's error kind, the token budget running out
// (often all of it spent thinking), or output that is not valid JSON for the schema.
export type FailureCause = ErrorKind | "out_of_tokens" | "bad_output";

// usageKnown is false when the provider reported no token usage, or the call
// failed in a way that may still be billed (a timeout). costUsd then undercounts.
// tokens are the provider's counts, null when it reported none.
type Spend = { costUsd: number; usageKnown: boolean; tokens: TokenUsage | null; latencyMs: number };
export type StructuredResult<T> = ({ ok: true; data: T } | { ok: false; cause: FailureCause; reason: string }) & Spend;

export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

// One chat call with response_format json_schema (strict), parsed and validated.
// A failure is returned, not thrown, so the caller can escalate or skip.
export async function callStructured<S extends z.ZodType>(
  client: NebiusClient,
  request: StructuredRequest<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const { model, schema, name, system, user, thinking, maxTokens } = request;
  const result = await client.chat({
    model: model.id,
    temperature: thinking ? 0.6 : 0,
    max_tokens: maxTokens,
    chat_template_kwargs: { enable_thinking: thinking },
    response_format: {
      type: "json_schema",
      json_schema: { name, strict: true, schema: toStrictJsonSchema(schema) },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  if (!result.ok) {
    const reason = `${result.error.kind}: ${result.error.message}`;
    return { ok: false, cause: result.error.kind, reason, costUsd: 0, usageKnown: false, tokens: null, latencyMs: result.latencyMs };
  }

  const usage = result.completion.usage;
  const tokens = usage ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens } : null;
  const costUsd = tokens ? estimateCostUsd(model, tokens) : 0;
  const choice = result.completion.choices[0];
  const usageKnown = Boolean(usage);
  const fail = (cause: FailureCause, reason: string) => ({
    ok: false as const,
    cause,
    reason,
    costUsd,
    usageKnown,
    tokens,
    latencyMs: result.latencyMs,
  });
  if (choice?.finish_reason === "length") return fail("out_of_tokens", "ran out of tokens");

  let json: unknown;
  try {
    json = JSON.parse(choice?.message.content ?? "");
  } catch {
    return fail("bad_output", "content is not valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail("bad_output", `output does not match schema: ${z.prettifyError(parsed.error)}`);
  return { ok: true, data: parsed.data, costUsd, usageKnown, tokens, latencyMs: result.latencyMs };
}
