-- The daily budget for trial runs, shared by every server instance. A trial run
-- reserves its worst case here before it starts and settles with what it
-- actually spent when it ends, as the in-memory ledger in
-- src/lib/server/daily-budget.ts does. No row holds anything about the visitor.
create table public.trial_spend (
  id uuid primary key default gen_random_uuid(),
  -- The UTC day the run started. A run that ends after midnight still counts
  -- against the day it started on.
  day date not null,
  reserved_usd numeric(10, 4) not null check (reserved_usd >= 0),
  -- Null until the run settles. Until then it counts as its whole reservation,
  -- so a run whose server died before settling still counts.
  spent_usd numeric(10, 4) check (spent_usd >= 0),
  created_at timestamptz not null default now()
);

create index trial_spend_day on public.trial_spend (day);

-- As with runs: only the server, with the secret key, reaches this table.
alter table public.trial_spend enable row level security;

-- Returns the reservation's id, or null when the day's budget can't cover it.
create function public.reserve_trial_budget(p_amount_usd numeric, p_budget_usd numeric)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_used numeric;
  v_id uuid;
begin
  -- One reservation at a time for each day, held until this call ends, so two
  -- runs that start together can't both fit in the same room.
  perform pg_advisory_xact_lock(hashtext('trial_spend:' || v_day::text));

  -- A month of spend is kept for the owner to look back on; older rows go.
  delete from public.trial_spend where day < v_day - 30;

  select coalesce(sum(coalesce(spent_usd, reserved_usd)), 0) into v_used
  from public.trial_spend
  where day = v_day;

  if v_used + p_amount_usd > p_budget_usd then
    return null;
  end if;

  insert into public.trial_spend (day, reserved_usd)
  values (v_day, p_amount_usd)
  returning id into v_id;
  return v_id;
end;
$$;

-- Settles a reservation once; a second call changes nothing.
create function public.settle_trial_budget(p_id uuid, p_spent_usd numeric)
returns void
language sql
set search_path = ''
as $$
  update public.trial_spend
  set spent_usd = greatest(p_spent_usd, 0)
  where id = p_id and spent_usd is null;
$$;

-- Postgres lets anyone run a new function, and Supabase's API roles would get
-- it too. Only the secret key's role may.
revoke all on function public.reserve_trial_budget(numeric, numeric) from public, anon, authenticated;
revoke all on function public.settle_trial_budget(uuid, numeric) from public, anon, authenticated;
grant execute on function public.reserve_trial_budget(numeric, numeric) to service_role;
grant execute on function public.settle_trial_budget(uuid, numeric) to service_role;
