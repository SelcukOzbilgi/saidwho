import type { Tier } from "../lib/run-state";

const MODEL: Record<Tier, string> = {
  lightning: "Nemotron 3.5 Lightning",
  nano: "Nemotron Nano",
  super: "Nemotron 3 Super",
  ultra: "Nemotron 3 Ultra",
};

// Ultra only runs when a check fails, so it stands out.
const LOOK: Record<Tier, string> = {
  lightning: "border-line text-muted",
  nano: "border-line text-muted",
  super: "border-foreground/30 text-foreground",
  ultra: "border-accent bg-accent/10 text-accent",
};

export function TierChip({ tier }: { tier: Tier }) {
  return (
    <span
      title={MODEL[tier]}
      className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px font-mono text-[10px] uppercase tracking-wide ${LOOK[tier]}`}
    >
      {tier}
    </span>
  );
}
