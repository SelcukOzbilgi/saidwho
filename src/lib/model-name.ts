import type { Tier } from "../agent/models";

// What the page calls each model: its name in full, not just the tier.
export const MODEL_NAME: Record<Tier, string> = {
  lightning: "Nemotron 3.5 Lightning",
  nano: "Nemotron 3 Nano",
  super: "Nemotron 3 Super",
  ultra: "Nemotron 3 Ultra",
};
