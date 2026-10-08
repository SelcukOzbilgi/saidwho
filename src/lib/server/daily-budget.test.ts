import { describe, expect, it } from "vitest";

import { createDailyLedger } from "./daily-budget";

describe("createDailyLedger", () => {
  it("allows no run when the budget is 0", () => {
    expect(createDailyLedger(0).reserve(0.15)).toBeNull();
  });

  it("holds reservations so overlapping runs can't jointly pass the budget", () => {
    const ledger = createDailyLedger(0.35);
    const a = ledger.reserve(0.15);
    const b = ledger.reserve(0.15);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(ledger.reserve(0.15)).toBeNull();

    // A run that spent less frees the rest of its reservation.
    a?.settle(0.01);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.01);
    expect(ledger.reserve(0.15)).not.toBeNull();
  });

  it("counts a settlement once", () => {
    const ledger = createDailyLedger(1);
    const r = ledger.reserve(0.15);
    r?.settle(0.1);
    r?.settle(0.1);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.1);
  });

  it("starts each UTC day from zero", () => {
    let now = new Date("2026-10-08T23:59:00Z");
    const ledger = createDailyLedger(0.2, () => now);
    ledger.reserve(0.15)?.settle(0.15);
    expect(ledger.reserve(0.15)).toBeNull();

    now = new Date("2026-10-09T00:01:00Z");
    expect(ledger.spentTodayUsd()).toBe(0);
    expect(ledger.reserve(0.15)).not.toBeNull();
  });

  it("still holds a reservation made before midnight", () => {
    let now = new Date("2026-10-08T23:59:00Z");
    const ledger = createDailyLedger(0.2, () => now);
    const late = ledger.reserve(0.15);
    now = new Date("2026-10-09T00:01:00Z");
    expect(ledger.reserve(0.15)).toBeNull();
    late?.settle(0.02);
    expect(ledger.reserve(0.15)).not.toBeNull();
  });
});
