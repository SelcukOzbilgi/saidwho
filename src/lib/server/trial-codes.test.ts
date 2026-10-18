import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "./env-schema";
import type { SupabaseRpc } from "./supabase-rpc";
import { createSharedTrialCodes, hashTrialCode, newTrialCode, trialCodeInsert, trialCodesFromEnv } from "./trial-codes";

const CODE = "fake-counted-code-for-tests"; // gitleaks:allow

describe("trial codes", () => {
  it("makes codes the shared code's rule would take, each one new", () => {
    const codes = Array.from({ length: 20 }, newTrialCode);
    for (const code of codes) expect(parseServerEnv({ TRIAL_ACCESS_CODE: code }).TRIAL_ACCESS_CODE).toBe(code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("hashes the code as sent, spaces around it aside", () => {
    expect(hashTrialCode(CODE)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTrialCode(` ${CODE}\n`)).toBe(hashTrialCode(CODE));
    expect(hashTrialCode(`${CODE}x`)).not.toBe(hashTrialCode(CODE));
  });

  it("writes an insert that holds the code's hash and never the code", () => {
    const insert = trialCodeInsert(CODE, "judges", 50);
    expect(insert).toBe(
      `insert into public.trial_codes (code_hash, label, max_runs) values ('${hashTrialCode(CODE)}', 'judges', 50);`,
    );
    expect(insert).not.toContain(CODE);
  });

  it("refuses a label or a number of runs the insert shouldn't carry", () => {
    for (const label of ["", "Judges", "a'b", "judges; drop table runs", "x".repeat(61)]) {
      expect(() => trialCodeInsert(CODE, label, 1)).toThrow();
    }
    for (const runs of [0, -1, 1.5, Number.NaN, 10_001]) expect(() => trialCodeInsert(CODE, "test", runs)).toThrow();
    expect(() => trialCodeInsert(CODE, "test", 1)).not.toThrow();
  });

  it("takes and gives back a run by the code's hash", async () => {
    const rpc = vi.fn<SupabaseRpc>(async () => "ok");
    const codes = createSharedTrialCodes(rpc);
    expect(await codes.use(CODE)).toBe("ok");
    rpc.mockResolvedValueOnce(null);
    await codes.giveBack(CODE);
    expect(rpc.mock.calls).toEqual([
      ["use_trial_code", { p_code_hash: hashTrialCode(CODE) }],
      ["give_back_trial_code", { p_code_hash: hashTrialCode(CODE) }],
    ]);
  });

  it("passes on what the database says of a code, and throws on anything else", async () => {
    for (const reply of ["ok", "used_up", "unknown"]) {
      expect(await createSharedTrialCodes(async () => reply).use(CODE)).toBe(reply);
    }
    for (const reply of [null, true, "OK", { used: 1 }]) {
      await expect(createSharedTrialCodes(async () => reply).use(CODE)).rejects.toThrow();
    }
  });

  it("has nowhere to count codes without Supabase", () => {
    expect(trialCodesFromEnv(parseServerEnv({}))).toBeNull();
    expect(
      trialCodesFromEnv(
        parseServerEnv({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fake" }), // gitleaks:allow
      ),
    ).not.toBeNull();
  });
});
