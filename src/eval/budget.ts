import { estimateCostUsd, MODELS } from "../agent/models";
import type { ChatParams, ChatResult, NebiusClient } from "../lib/server/providers/nebius";

// A Nebius client whose calls never cost more than maxUsd together, however many
// run at once, for replays that make paid calls (scripts/rejudge.ts). Before a
// call starts, the most it could cost is set aside: every byte of its messages
// as a prompt token, and every completion token it may use. A call that would
// take what is spent and set aside past the cap waits for the calls running to
// settle, since they usually cost far less than they set aside, and is refused
// as a quota error, so nothing tries it again, only when what is already spent
// leaves no room for it. When a call returns, what it reported replaces what was
// set aside; when it reported no usage, or failed, all of that stays spent.

export const CAP_REACHED = "the replay's spending cap is reached";

export type CappedNebius = {
  client: NebiusClient;
  // Spent so far, counting what calls still running have set aside.
  committedUsd: () => number;
  spentUsd: () => number;
  refused: () => number;
};

const byId = new Map(Object.values(MODELS).map((m) => [m.id, m]));

// The most a call could cost: an unknown model is priced like the dearest one.
function mostItCosts(params: ChatParams): number {
  const bytes = (params.messages ?? []).reduce((sum, m) => sum + Buffer.byteLength(typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""), "utf8"), 0);
  const completion = Number(params.max_tokens ?? params.max_completion_tokens ?? 0);
  const usage = { promptTokens: bytes, completionTokens: completion };
  const model = byId.get(String(params.model));
  return model ? estimateCostUsd(model, usage) : Math.max(...Object.values(MODELS).map((m) => estimateCostUsd(m, usage)));
}

export function capSpend(inner: NebiusClient, maxUsd: number): CappedNebius {
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error(`the spending cap must be a number of dollars above zero, not ${maxUsd}`);
  let spent = 0;
  let reserved = 0;
  let refused = 0;
  // Calls waiting for others to settle, woken each time one does.
  let waiting: (() => void)[] = [];
  const settled = () => new Promise<void>((resolve) => waiting.push(resolve));
  const client: NebiusClient = {
    listModels: () => inner.listModels(),
    chat: async (params: ChatParams): Promise<ChatResult> => {
      const most = mostItCosts(params);
      while (spent + reserved + most > maxUsd) {
        if (spent + most > maxUsd || reserved === 0) {
          refused++;
          return { ok: false, error: { provider: "nebius", kind: "quota", status: null, message: CAP_REACHED }, latencyMs: 0 };
        }
        await settled();
      }
      reserved += most;
      try {
        const result = await inner.chat(params);
        const usage = result.ok ? result.completion.usage : undefined;
        const model = byId.get(String(params.model));
        spent += usage && model ? estimateCostUsd(model, { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens }) : most;
        return result;
      } catch (err) {
        spent += most;
        throw err;
      } finally {
        reserved -= most;
        const wake = waiting;
        waiting = [];
        for (const resolve of wake) resolve();
      }
    },
  };
  return { client, committedUsd: () => spent + reserved, spentUsd: () => spent, refused: () => refused };
}
