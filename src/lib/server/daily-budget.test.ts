import { describe, expect, it } from "vitest";

import { createDailyLedger } from "./daily-budget";

describe("createDailyLedger", () => {
  it("allows no run when the budget is 0", async () => {
    expect(await createDailyLedger(0).reserve(0.15)).toBeNull();
  });

  it("holds reservations so overlapping runs can't jointly pass the budget", async () => {
    const ledger = createDailyLedger(0.35);
    const [a, b, c] = await Promise.all([ledger.reserve(0.15), ledger.reserve(0.15), ledger.reserve(0.15)]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(c).toBeNull();

    // A run that spent less frees the rest of its reservation.
    await a?.settle(0.01);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.01);
    expect(await ledger.reserve(0.15)).not.toBeNull();
  });

  it("counts a settlement once", async () => {
    const ledger = createDailyLedger(1);
    const r = await ledger.reserve(0.15);
    await r?.settle(0.1);
    await r?.settle(0.1);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.1);
  });

  it("starts each UTC day from zero", async () => {
    let now = new Date("2026-10-08T23:59:00Z");
    const ledger = createDailyLedger(0.2, () => now);
    await (await ledger.reserve(0.15))?.settle(0.15);
    expect(await ledger.reserve(0.15)).toBeNull();

    now = new Date("2026-10-09T00:01:00Z");
    expect(ledger.spentTodayUsd()).toBe(0);
    expect(await ledger.reserve(0.15)).not.toBeNull();
  });

  it("still holds a reservation made before midnight", async () => {
    let now = new Date("2026-10-08T23:59:00Z");
    const ledger = createDailyLedger(0.2, () => now);
    const late = await ledger.reserve(0.15);
    now = new Date("2026-10-09T00:01:00Z");
    expect(await ledger.reserve(0.15)).toBeNull();
    await late?.settle(0.02);
    expect(await ledger.reserve(0.15)).not.toBeNull();
  });
});
