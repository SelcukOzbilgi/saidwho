import { z } from "zod";

import type { NebiusClient } from "../lib/server/providers/nebius";
import { estimateCostUsd, type ModelSpec } from "./models";

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

// usageKnown is false when the provider reported no token usage, or the call
// failed in a way that may still be billed (a timeout). costUsd then undercounts.
export type StructuredResult<T> =
  | { ok: true; data: T; costUsd: number; usageKnown: boolean; latencyMs: number }
  | { ok: false; reason: string; costUsd: number; usageKnown: boolean; latencyMs: number };

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
    return { ok: false, reason, costUsd: 0, usageKnown: false, latencyMs: result.latencyMs };
  }

  const usage = result.completion.usage;
  const costUsd = usage
    ? estimateCostUsd(model, { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens })
    : 0;
  const choice = result.completion.choices[0];
  const usageKnown = Boolean(usage);
  const fail = (reason: string) => ({ ok: false as const, reason, costUsd, usageKnown, latencyMs: result.latencyMs });
  if (choice?.finish_reason === "length") return fail("ran out of tokens");

  let json: unknown;
  try {
    json = JSON.parse(choice?.message.content ?? "");
  } catch {
    return fail("content is not valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail(`output does not match schema: ${z.prettifyError(parsed.error)}`);
  return { ok: true, data: parsed.data, costUsd, usageKnown, latencyMs: result.latencyMs };
}
