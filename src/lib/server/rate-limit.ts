import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { z } from "zod";

import type { ServerEnv } from "./env-schema";
import { createSupabaseRpc, type SupabaseRpc } from "./supabase-rpc";

// How many runs one visitor may start in a window. Windows are fixed and start
// on the epoch, so a day's window starts at UTC midnight, as the trial budget's
// day does. A visitor is counted by a keyed hash of their address (see
// client-ip.ts), never the address itself. In this server's memory a count is
// dropped once its window ends; in Supabase, an hour after that (see the migration).

export type Limit = { name: "runs" | "trial"; max: number; windowSeconds: number };

export type RateLimiter = {
  // When the run may start, it is counted and this gives the start of the window
  // it was counted in, in epoch milliseconds. A refused run isn't counted: null.
  hit: (visitor: string, limit: Limit) => Promise<number | null>;
  // Gives back one run counted in the window that starts at `windowStart`, as
  // `hit` gave it, for a run refused after it was counted. Never below 0. The
  // window is passed in, not worked out again, so a give-back that runs after a
  // window ends can't take a count from the next one.
  unhit: (visitor: string, limit: Limit, windowStart: number) => Promise<void>;
};

export const HOUR_SECONDS = 3_600;
export const DAY_SECONDS = 86_400;

// Seconds until the window holding `nowMs` ends, for a Retry-After header.
export const secondsLeftInWindow = (windowSeconds: number, nowMs: number = Date.now()): number =>
  windowSeconds - (Math.floor(nowMs / 1000) % windowSeconds);

// Without the key, a stored hash can't be matched to an address by trying every
// IPv4 address. Cut to 128 bits, which is plenty to keep visitors apart.
export const hashVisitor = (key: Buffer, visitor: string): string =>
  createHmac("sha256", key).update(visitor).digest("hex").slice(0, 32);

// Counts in this server's memory, with a key made fresh on each start. Each
// instance keeps its own counts and a restart clears them, as the in-memory
// ledger does.
export function createMemoryLimiter(now: () => number = Date.now): RateLimiter {
  const key = randomBytes(32);
  const counts = new Map<string, { endsAt: number; hits: number }>();
  const idOf = (start: number, visitor: string, { name }: Limit) => `${name}:${start}:${hashVisitor(key, visitor)}`;
  return {
    async hit(visitor, limit) {
      const at = now();
      // Ended windows go first. A small demo has few visitors a day, so a full pass is cheap.
      for (const [id, count] of counts) if (count.endsAt <= at) counts.delete(id);
      const windowMs = limit.windowSeconds * 1000;
      const start = Math.floor(at / windowMs) * windowMs;
      const id = idOf(start, visitor, limit);
      const count = counts.get(id) ?? { endsAt: start + windowMs, hits: 0 };
      if (count.hits >= limit.max) return null;
      count.hits += 1;
      counts.set(id, count);
      return start;
    },
    async unhit(visitor, limit, windowStart) {
      const count = counts.get(idOf(windowStart, visitor, limit));
      if (count && count.hits > 0) count.hits -= 1;
    },
  };
}

// Counts in the Supabase function from supabase/migrations/, so every instance
// shares them. Each hit is one statement in the database. Errors are thrown,
// and the caller decides what a failed count means.
export function createSharedLimiter(rpc: SupabaseRpc, key: Buffer): RateLimiter {
  return {
    async hit(visitor, { name, max, windowSeconds }) {
      const reply = await rpc("hit_rate_limit", {
        p_key: `${name}:${hashVisitor(key, visitor)}`,
        p_max: max,
        p_window_seconds: windowSeconds,
      });
      // The window's start as a timestamp, or null when the run is refused.
      const start = z.string().nullable().parse(reply);
      if (start === null) return null;
      const ms = Date.parse(start);
      if (!Number.isFinite(ms)) throw new Error("hit_rate_limit returned a window start that isn't a time");
      return ms;
    },
    async unhit(visitor, { name }, windowStart) {
      await rpc("unhit_rate_limit", {
        p_key: `${name}:${hashVisitor(key, visitor)}`,
        p_window_start: new Date(windowStart).toISOString(),
      });
    },
  };
}

// Every instance must hash a visitor the same way, so the key comes from a secret
// they all hold. It is derived rather than the Supabase key itself, so the hash
// can't be used to learn anything about that key.
export const visitorHashKey = (supabaseSecretKey: string): Buffer =>
  createHmac("sha256", supabaseSecretKey).update("saidwho visitor hash v1").digest();

// Every run waits on the count, including one on the visitor's own keys that
// goes ahead when the count fails, so a slow database gets less time here. A
// refused run waits on giving its counts back for no longer.
export const LIMITER_TIMEOUT_MS = 2_000;

export function limiterFromEnv(env: ServerEnv): RateLimiter {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return createMemoryLimiter();
  const rpc = createSupabaseRpc({
    url: env.SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
    timeoutMs: LIMITER_TIMEOUT_MS,
  });
  return createSharedLimiter(rpc, visitorHashKey(env.SUPABASE_SECRET_KEY));
}
