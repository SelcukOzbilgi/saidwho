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
  ])("%s grants %s to the server's role only", (file, table, privileges) => {
    const sql = migration(file);
    expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`);
    expect(sql).toContain(`grant ${privileges} on table public.${table} to service_role;`);
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });

  it("deletes ended counts only well after their window", () => {
    expect(migration("20261012120100_rate_limits.sql")).toContain("where expires_at <= now() - interval '1 hour'");
  });
});
