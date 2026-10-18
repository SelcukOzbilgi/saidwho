import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The migrations can't run here, so this checks what a new Supabase project
// needs from them: it no longer grants new tables to the API roles, and the
// functions run as the server's role, so each table must be granted to it.
const migration = (name: string) =>
  readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8").replace(/\s+/g, " ");

describe("supabase migrations", () => {
  it.each([
    ["20261010120000_runs.sql", "runs", "select, insert"],
    ["20261012120000_trial_budget.sql", "trial_spend", "select, insert, update, delete"],
    ["20261012120100_rate_limits.sql", "rate_limits", "select, insert, update, delete"],
    ["20261018120000_trial_codes.sql", "trial_codes", "select, update"],
  ])("%s grants %s to the server's role only", (file, table, privileges) => {
    const sql = migration(file);
    expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    expect(sql).toContain(`grant ${privileges} on table public.${table} to service_role;`);
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });

  it("deletes ended counts only well after their window", () => {
    expect(migration("20261012120100_rate_limits.sql")).toContain("where expires_at <= now() - interval '1 hour'");
  });

  it.each([
    ["20261012120100_rate_limits.sql", "hit_rate_limit(text, integer, integer)"],
    ["20261012120100_rate_limits.sql", "unhit_rate_limit(text, timestamptz)"],
    ["20261018120000_trial_codes.sql", "use_trial_code(text)"],
    ["20261018120000_trial_codes.sql", "give_back_trial_code(text)"],
  ])(
    "%s lets only the server's role run %s",
    (file, fn) => {
      const sql = migration(file);
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    },
  );

  it("takes a code's run only while it has one left, and never gives one back below 0", () => {
    const sql = migration("20261018120000_trial_codes.sql");
    expect(sql).toContain("where code_hash = p_code_hash and used_runs < max_runs;");
    expect(sql).toContain("where code_hash = p_code_hash and used_runs > 0;");
  });

  it("keeps the whole reservation when the spend arrives as null", () => {
    expect(migration("20261012120000_trial_budget.sql")).toContain(
      "set spent_usd = greatest(coalesce(p_spent_usd, t.reserved_usd), 0)",
    );
  });
});
