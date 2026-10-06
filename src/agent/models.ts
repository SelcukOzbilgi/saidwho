// Model tiers on Nebius Token Factory. Prices are USD per 1M tokens.
// Escalation moves up a tier only when a check fails (invalid JSON, low
// confidence, conflicting dates); see the orchestrator.

export type Tier = "lightning" | "nano" | "super" | "ultra";

export type ModelSpec = {
  readonly tier: Tier;
  readonly id: string;
  readonly inputUsdPerM: number;
  readonly outputUsdPerM: number;
};

export const MODELS: Readonly<Record<Tier, ModelSpec>> = {
  lightning: { tier: "lightning", id: "nvidia/Nemotron-3_5-Lightning", inputUsdPerM: 0.06, outputUsdPerM: 0.24 },
  // ID confirmed via models.list on 2026-10-06; price not yet confirmed.
  nano: { tier: "nano", id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", inputUsdPerM: 0.06, outputUsdPerM: 0.24 },
  super: { tier: "super", id: "nvidia/nemotron-3-super-120b-a12b", inputUsdPerM: 0.3, outputUsdPerM: 0.9 },
  ultra: { tier: "ultra", id: "nvidia/Nemotron-3-Ultra-550b-a55b", inputUsdPerM: 1, outputUsdPerM: 3 },
};

export type TokenUsage = { promptTokens: number; completionTokens: number };

export function estimateCostUsd(model: ModelSpec, usage: TokenUsage): number {
  return (usage.promptTokens * model.inputUsdPerM + usage.completionTokens * model.outputUsdPerM) / 1_000_000;
}
