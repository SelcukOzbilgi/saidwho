// Model tiers on Nebius Token Factory. Prices are USD per 1M tokens.
// A step moves up a tier only when a check fails (a failed call, a snippet not
// on its page, a verdict pointing at unverified evidence);
// see the orchestrator.

export type Tier = "lightning" | "nano" | "super" | "ultra";

export type ModelSpec = {
  readonly tier: Tier;
  readonly id: string;
  readonly inputUsdPerM: number;
  readonly outputUsdPerM: number;
  // Completion tokens a verdict may use, thinking included. Lightning and Ultra
  // think longer than Super before they answer, so they get more room.
  readonly judgeMaxTokens: number;
};

export const MODELS: Readonly<Record<Tier, ModelSpec>> = {
  lightning: { tier: "lightning", id: "nvidia/Nemotron-3_5-Lightning", inputUsdPerM: 0.06, outputUsdPerM: 0.24, judgeMaxTokens: 16_000 },
  // Only the smoke test calls Nano; no investigation step uses it.
  nano: { tier: "nano", id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", inputUsdPerM: 0.06, outputUsdPerM: 0.24, judgeMaxTokens: 16_000 },
  super: { tier: "super", id: "nvidia/nemotron-3-super-120b-a12b", inputUsdPerM: 0.3, outputUsdPerM: 0.9, judgeMaxTokens: 8_000 },
  ultra: { tier: "ultra", id: "nvidia/Nemotron-3-Ultra-550b-a55b", inputUsdPerM: 1, outputUsdPerM: 3, judgeMaxTokens: 16_000 },
};

// Which model each step uses. The app always runs the cascade; the eval also
// runs every step on one model, to measure what the cascade saves.
export type ModelPolicy = {
  readonly plan: ModelSpec;
  readonly read: ModelSpec;
  // A page read again after the first reading's check failed.
  readonly reread: ModelSpec;
  readonly trace: ModelSpec;
  readonly judge: ModelSpec;
  // A second judge after the first one's call or verdict failed its check.
  readonly rejudge: ModelSpec;
};

// The plan is one call, so it runs on Ultra: in the first two evals Super's
// plans came back empty or full of markup 7 times in 34 and never named Muriel
// Strode for leave-a-trail, and Ultra's did neither, for about $0.003 a run more.
export const CASCADE: ModelPolicy = {
  plan: MODELS.ultra,
  read: MODELS.lightning,
  reread: MODELS.super,
  trace: MODELS.super,
  judge: MODELS.super,
  rejudge: MODELS.ultra,
};

export const everyStepOn = (model: ModelSpec): ModelPolicy => ({
  plan: model,
  read: model,
  reread: model,
  trace: model,
  judge: model,
  rejudge: model,
});

export type TokenUsage = { promptTokens: number; completionTokens: number };

export function estimateCostUsd(model: ModelSpec, usage: TokenUsage): number {
  return (usage.promptTokens * model.inputUsdPerM + usage.completionTokens * model.outputUsdPerM) / 1_000_000;
}
