import { describe, expect, it } from "vitest";

import { createDailyLedger, createSharedLedger, ledgerFromEnv } from "./daily-budget";
import { parseServerEnv } from "./env-schema";
import type { SupabaseRpc } from "./supabase-rpc";

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

  it("counts a spend that isn't a number as the whole reservation", async () => {
    const ledger = createDailyLedger(0.35);
    await (await ledger.reserve(0.2))?.settle(Number.NaN);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.2);
    expect(await ledger.reserve(0.2)).toBeNull();
    await (await ledger.reserve(0.1))?.settle(Number.POSITIVE_INFINITY);
    expect(ledger.spentTodayUsd()).toBeCloseTo(0.3);
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

// Stands in for the functions in supabase/migrations/: each reserve waits its
// turn, as the advisory lock makes it, and takes a moment, as a network call does.
function fakeDatabase() {
  const rows = new Map<string, { reserved: number; spent: number | null }>();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let queue = Promise.resolve();
  const rpc: SupabaseRpc = (name, args) => {
    calls.push({ name, args });
    const turn = queue.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const id = String(args.p_id);
      if (name === "reserve_trial_budget") {
        const amount = Number(args.p_amount_usd);
        const used = [...rows.values()].reduce((sum, row) => sum + (row.spent ?? row.reserved), 0);
        if (used + amount > Number(args.p_budget_usd)) return false;
        if (rows.has(id)) return false;
        rows.set(id, { reserved: amount, spent: null });
        return true;
      }
      // JSON has no NaN, so a null spend is what arrives, and it keeps the reservation.
      const row = rows.get(id);
      const spent = args.p_spent_usd === null ? null : Number(args.p_spent_usd);
      if (!row) rows.set(id, { reserved: 0, spent: 0 });
      else if (row.spent === null) row.spent = Math.max(spent ?? row.reserved, 0);
      return null;
    });
    queue = turn.then(() => undefined);
    return turn;
  };
  return { rpc, rows, calls, names: () => calls.map((c) => c.name) };
}

describe("createSharedLedger", () => {
  it("lets no more runs start together than the shared budget covers", async () => {
    const db = fakeDatabase();
    // Two instances, one database.
    const a = createSharedLedger(db.rpc, 0.5);
    const b = createSharedLedger(db.rpc, 0.5);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).reserve(0.2)));
    expect(results.filter(Boolean)).toHaveLength(2);
    // Each reserve is one call, with no read before it.
    expect(db.names()).toEqual(Array(10).fill("reserve_trial_budget"));
  });

  it("settles once, and frees what the run didn't spend", async () => {
    const db = fakeDatabase();
    const ledger = createSharedLedger(db.rpc, 0.3);
    const r = await ledger.reserve(0.2);
    expect(await ledger.reserve(0.2)).toBeNull();
    await r?.settle(0.05);
    await r?.settle(0.05);
    expect(db.names().filter((c) => c === "settle_trial_budget")).toHaveLength(1);
    expect(await ledger.reserve(0.2)).not.toBeNull();
  });

  it("sends a spend that isn't a number as null, which keeps the reservation", async () => {
    const db = fakeDatabase();
    const ledger = createSharedLedger(db.rpc, 0.3);
    await (await ledger.reserve(0.2))?.settle(Number.NaN);
    expect(db.calls.at(-1)?.args.p_spent_usd).toBeNull();
    expect(await ledger.reserve(0.2)).toBeNull();
  });

  it("releases a reservation whose call failed here but still landed in the database", async () => {
    const db = fakeDatabase();
    // The reserve commits, then the reply is lost, as when the app's timeout fires first.
    const flaky: SupabaseRpc = async (name, args) => {
      const reply = await db.rpc(name, args);
      if (name === "reserve_trial_budget") throw new Error("The operation was aborted due to timeout");
      return reply;
    };
    const ledger = createSharedLedger(flaky, 0.2, () => "11111111-1111-4111-8111-111111111111");
    await expect(ledger.reserve(0.2)).rejects.toThrow("timeout");
    expect(db.calls.at(-1)).toEqual({
      name: "settle_trial_budget",
      args: { p_id: "11111111-1111-4111-8111-111111111111", p_spent_usd: 0 },
    });
    expect(await createSharedLedger(db.rpc, 0.2).reserve(0.2)).not.toBeNull();
  });

  it("sets nothing aside when the release got there before the reserve", async () => {
    const db = fakeDatabase();
    const id = "22222222-2222-4222-8222-222222222222";
    await db.rpc("settle_trial_budget", { p_id: id, p_spent_usd: 0 });
    expect(await db.rpc("reserve_trial_budget", { p_id: id, p_amount_usd: 0.2, p_budget_usd: 1 })).toBe(false);
    expect(db.rows.get(id)).toEqual({ reserved: 0, spent: 0 });
  });

  it("still throws the reserve's error when the release fails too", async () => {
    const rpc: SupabaseRpc = async (name) => Promise.reject(new Error(`${name} failed with 503`));
    await expect(createSharedLedger(rpc, 1).reserve(0.2)).rejects.toThrow("reserve_trial_budget failed with 503");
  });

  it("asks the database nothing when one run is more than the whole budget", async () => {
    const db = fakeDatabase();
    expect(await createSharedLedger(db.rpc, 0).reserve(0.2)).toBeNull();
    expect(db.calls).toEqual([]);
  });

  it("throws when the database's reply isn't true or false", async () => {
    const ledger = createSharedLedger(async () => ({ id: 1 }), 1);
    await expect(ledger.reserve(0.2)).rejects.toThrow();
  });

  it("is shared only when Supabase is set up", () => {
    expect(ledgerFromEnv(parseServerEnv({}))).toHaveProperty("spentTodayUsd");
    const env = parseServerEnv({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_fake-for-tests-only", // gitleaks:allow
    });
    const shared = ledgerFromEnv(env);
    expect(shared).not.toHaveProperty("spentTodayUsd");
  });
});
