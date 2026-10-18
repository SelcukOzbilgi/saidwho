import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { ServerEnv } from "./env-schema";
import { createSupabaseRpc, type SupabaseRpc } from "./supabase-rpc";

// Access codes that each allow a set number of trial runs, such as one code
// for a single test run and another for 50 runs. They are kept in Supabase
// (supabase/migrations/20261018120000_trial_codes.sql), by hash only, and the
// server takes one run from a code before its run starts. When a code's runs
// are all taken, the code is refused. They work next to the one shared
// TRIAL_ACCESS_CODE, which has no count, and only while that is set: it is
// what makes the trial ask for a code at all.

// "ok": the code had a run left, and one is now taken. "used_up": the code is
// known, but its runs are all taken. "unknown": no code has this hash.
export type CodeUse = "ok" | "used_up" | "unknown";

export type TrialCodes = {
  use: (code: string) => Promise<CodeUse>;
  // Gives back the run `use` took, for a run refused after its code was counted.
  giveBack: (code: string) => Promise<void>;
};

// A code is random enough (see newTrialCode) that a plain hash is enough to
// keep it out of the table.
export const hashTrialCode = (code: string): string => createHash("sha256").update(code.trim()).digest("hex");

// 18 random bytes as 24 letters, digits, - and _, so a code passes the same
// rule as TRIAL_ACCESS_CODE and a /run#code=... link carries it unchanged.
export const newTrialCode = (): string => randomBytes(18).toString("base64url");

// Labels are checked here, so the insert can't carry anything but a name.
export const TRIAL_CODE_LABEL = /^[a-z0-9-]{1,60}$/;
export const MAX_TRIAL_CODE_RUNS = 10_000;

// The line to run in the Supabase SQL Editor to turn a code on. It holds the
// code's hash, never the code.
export function trialCodeInsert(code: string, label: string, runs: number): string {
  if (!TRIAL_CODE_LABEL.test(label)) throw new Error("a label is 1 to 60 lowercase letters, digits or -");
  if (!Number.isInteger(runs) || runs < 1 || runs > MAX_TRIAL_CODE_RUNS) {
    throw new Error(`runs is a whole number from 1 to ${MAX_TRIAL_CODE_RUNS}`);
  }
  return `insert into public.trial_codes (code_hash, label, max_runs) values ('${hashTrialCode(code)}', '${label}', ${runs});`;
}

// Codes in the Supabase functions from the migration. Each use is one
// statement in the database, so two runs can't both take a code's last run.
// Errors are thrown, and the caller decides what a failed count means.
export function createSharedTrialCodes(rpc: SupabaseRpc): TrialCodes {
  const use = z.enum(["ok", "used_up", "unknown"]);
  return {
    async use(code) {
      return use.parse(await rpc("use_trial_code", { p_code_hash: hashTrialCode(code) }));
    },
    async giveBack(code) {
      await rpc("give_back_trial_code", { p_code_hash: hashTrialCode(code) });
    },
  };
}

// A run waits on its code's count before it starts, as it does on the limiter.
export const TRIAL_CODES_TIMEOUT_MS = 2_000;

// Without Supabase there is nowhere to count, so only the shared code works.
export function trialCodesFromEnv(env: ServerEnv): TrialCodes | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return null;
  return createSharedTrialCodes(
    createSupabaseRpc({ url: env.SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY, timeoutMs: TRIAL_CODES_TIMEOUT_MS }),
  );
}
