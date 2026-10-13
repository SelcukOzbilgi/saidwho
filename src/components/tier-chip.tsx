import { MODELS } from "../agent/models";
import { MODEL_NAME } from "../lib/model-name";
import type { Tier } from "../lib/run-state";

// Ultra only runs when a check fails, so it stands out.
const LOOK: Record<Tier, string> = {
  lightning: "border-line text-muted",
  nano: "border-line text-muted",
  super: "border-foreground/30 text-foreground",
  ultra: "border-accent bg-accent/10 text-accent-ink",
};

// The model's name; hovering shows the id it runs under on Nebius.
export function TierChip({ tier }: { tier: Tier }) {
  return (
    <span
      title={MODELS[tier].id}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-px font-mono text-[10px] tracking-wide ${LOOK[tier]}`}
    >
      {MODEL_NAME[tier]}
    </span>
  );
}
