// Smoke test for Nebius Token Factory: checks each model tier's plain reply,
// thinking on and off, JSON schema output and tool calls.
// Run: pnpm smoke:nebius
// Prints model ids, latency, token usage and pass/fail per capability.
// Never prints keys, headers or raw SDK errors.

import { estimateCostUsd, MODELS, type ModelSpec } from "../../src/agent/models";
import { parseServerEnv, requireOwnerKeys } from "../../src/lib/server/env-schema";
import { redactSecrets } from "../../src/lib/server/safe-error";
import { type ChatParams, type ChatResult, createNebiusClient } from "../../src/lib/server/providers/nebius";

type Check = { name: string; params: ChatParams; verify: (result: ChatResult & { ok: true }) => string | null };

const PAGE = `From "Letters to a Friend", 1913, page 42: "Be the change that you wish to see in the world," he wrote.`;

const READER_SCHEMA = {
  type: "object",
  properties: {
    contains_quote: { type: "boolean" },
    exact_snippet: { type: "string" },
    pub_date: { type: "string" },
  },
  required: ["contains_quote", "exact_snippet", "pub_date"],
  additionalProperties: false,
} as const;

function message(result: ChatResult & { ok: true }) {
  // Nebius adds reasoning fields that the OpenAI types do not declare.
  return result.completion.choices[0]?.message as unknown as
    | ({ content: string | null; tool_calls?: { function?: { name: string; arguments: string } }[] } & Record<
        string,
        unknown
      >)
    | undefined;
}

function hasReasoning(result: ChatResult & { ok: true }): boolean {
  const msg = message(result);
  const reasoning = msg?.reasoning_content ?? msg?.reasoning;
  return typeof reasoning === "string" && reasoning.trim().length > 0;
}

function checksFor(model: ModelSpec): Check[] {
  const base = { model: model.id, temperature: 0 };
  return [
    {
      // No chat_template_kwargs: shows whether thinking is on by default.
      name: "default",
      params: {
        ...base,
        max_tokens: 512,
        messages: [
          { role: "system", content: "Reply with exactly: OK" },
          { role: "user", content: "ping" },
        ],
      },
      verify: (r) => (message(r)?.content?.includes("OK") ? null : "reply did not contain OK"),
    },
    {
      name: "thinking_off",
      params: {
        ...base,
        max_tokens: 64,
        chat_template_kwargs: { enable_thinking: false },
        messages: [{ role: "user", content: "What is 17 + 25? Reply with the number only." }],
      },
      verify: (r) => (message(r)?.content?.includes("42") ? null : "wrong or empty answer"),
    },
    {
      name: "thinking_on",
      params: {
        ...base,
        temperature: 0.6,
        max_tokens: 1024,
        chat_template_kwargs: { enable_thinking: true },
        messages: [{ role: "user", content: "What is 17 + 25? Reply with the number only." }],
      },
      verify: (r) => (hasReasoning(r) ? null : "no reasoning field returned"),
    },
    {
      name: "json_schema",
      params: {
        ...base,
        max_tokens: 256,
        chat_template_kwargs: { enable_thinking: false },
        response_format: {
          type: "json_schema",
          json_schema: { name: "reader_output", strict: true, schema: READER_SCHEMA },
        },
        messages: [
          { role: "system", content: "Extract evidence about the quote from the page. Output JSON only." },
          { role: "user", content: `Quote: "Be the change you wish to see in the world"\n\nPage:\n${PAGE}` },
        ],
      },
      verify: (r) => {
        try {
          const parsed = JSON.parse(message(r)?.content ?? "") as Record<string, unknown>;
          const keys = Object.keys(parsed).sort().join(",");
          return keys === "contains_quote,exact_snippet,pub_date" ? null : `unexpected keys: ${keys}`;
        } catch {
          return "content is not valid JSON";
        }
      },
    },
    {
      name: "tool_call",
      params: {
        ...base,
        max_tokens: 256,
        chat_template_kwargs: { enable_thinking: false },
        tool_choice: "auto",
        tools: [
          {
            type: "function",
            function: {
              name: "search_web",
              description: "Search the web for a query.",
              parameters: {
                type: "object",
                properties: { query: { type: "string" } },
                required: ["query"],
              },
            },
          },
        ],
        messages: [
          { role: "user", content: 'Use the search_web tool to look up who first said "Be the change you wish to see".' },
        ],
      },
      verify: (r) => {
        const call = message(r)?.tool_calls?.[0]?.function;
        if (call?.name !== "search_web") return "no search_web tool call";
        try {
          return typeof (JSON.parse(call.arguments) as { query?: unknown }).query === "string" ? null : "bad args";
        } catch {
          return "tool arguments are not JSON";
        }
      },
    },
  ];
}

async function main(): Promise<void> {
  const env = parseServerEnv(process.env);
  const { NEBIUS_API_KEY: nebiusApiKey } = requireOwnerKeys(env, ["NEBIUS_API_KEY"]);
  const client = createNebiusClient({ apiKey: nebiusApiKey, baseURL: env.NEBIUS_BASE_URL });

  const listed = await client.listModels();
  if (!listed.ok) {
    console.error("models.list failed:", listed.error);
    process.exitCode = 1;
    return;
  }
  const nemotron = listed.ids.filter((id) => /nemotron/i.test(id)).sort();
  console.log(`Nemotron models on this account (${nemotron.length}):`);
  for (const id of nemotron) console.log(`  ${id}`);

  const models = Object.values(MODELS).map((model) => {
    const exact = listed.ids.find((id) => id.toLowerCase() === model.id.toLowerCase());
    return { model: exact ? { ...model, id: exact } : model, listed: Boolean(exact) };
  });
  for (const { model, listed: found } of models) {
    if (!found) console.log(`WARN ${model.tier}: ${model.id} not in models.list (tested anyway)`);
  }

  let totalCost = 0;
  const rows = await Promise.all(
    models.map(async ({ model }) => {
      const out: string[] = [];
      for (const check of checksFor(model)) {
        const result = await client.chat(check.params);
        if (!result.ok) {
          const detail = result.error.detail ? ` (${result.error.detail})` : "";
          out.push(`${model.tier.padEnd(9)} ${check.name.padEnd(12)} ERROR ${result.error.kind} ${result.error.status ?? ""}${detail} ${result.latencyMs}ms`);
          continue;
        }
        const usage = result.completion.usage;
        const cost = usage
          ? estimateCostUsd(model, { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens })
          : 0;
        totalCost += cost;
        const problem = check.verify(result);
        const reasoning = hasReasoning(result) ? " reasoning=yes" : "";
        out.push(
          `${model.tier.padEnd(9)} ${check.name.padEnd(12)} ${problem ? `FAIL ${problem}` : "PASS"} ${result.latencyMs}ms ` +
            `in=${usage?.prompt_tokens ?? "?"} out=${usage?.completion_tokens ?? "?"}${reasoning}`,
        );
      }
      return out;
    }),
  );

  console.log("\ntier      check        result");
  for (const line of rows.flat()) console.log(line);
  console.log(`\nEstimated cost: $${totalCost.toFixed(4)}`);
}

main().catch((err: unknown) => {
  // Only the error name: SDK errors can carry request config.
  console.error("Smoke test crashed:", err instanceof Error ? `${err.name}: ${redactSecrets(err.message, [process.env.NEBIUS_API_KEY]).slice(0, 200)}` : "unknown");
  process.exitCode = 1;
});
