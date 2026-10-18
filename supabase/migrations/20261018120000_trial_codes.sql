-- Access codes that each allow a set number of trial runs, next to the one
-- shared TRIAL_ACCESS_CODE (see src/lib/server/trial-codes.ts). Only a code's
-- SHA-256 hash is kept, so the table can't give a code away. `pnpm trial-code`
-- makes a code and prints the insert for it.
create table public.trial_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  -- A name to tell codes apart, as in "judges" or "test".
  label text not null default '' check (char_length(label) <= 60),
  max_runs integer not null check (max_runs >= 1),
  used_runs integer not null default 0 check (used_runs >= 0),
  created_at timestamptz not null default now()
);

-- As with runs: only the server, with the secret key, reaches this table. The
-- server only reads codes and counts their runs; codes are added in the SQL
-- Editor.
alter table public.trial_codes enable row level security;
revoke all on table public.trial_codes from anon, authenticated;
grant select, update on table public.trial_codes to service_role;

-- Takes one run from the code with this hash. Returns 'ok' when the code had a
-- run left, 'used_up' when its runs are all taken, and 'unknown' when no code
-- has this hash. One statement takes the run, so two runs that start together
-- can't both take the last one.
create function public.use_trial_code(p_code_hash text)
returns text
language plpgsql
set search_path = ''
as $$
begin
  update public.trial_codes
  set used_runs = used_runs + 1
  where code_hash = p_code_hash and used_runs < max_runs;
  if found then
    return 'ok';
  end if;
  if exists (select 1 from public.trial_codes where code_hash = p_code_hash) then
    return 'used_up';
  end if;
  return 'unknown';
end;
$$;

-- Gives back a run use_trial_code took, for a run refused after its code was
-- counted. A count never goes below 0.
create function public.give_back_trial_code(p_code_hash text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.trial_codes
  set used_runs = used_runs - 1
  where code_hash = p_code_hash and used_runs > 0;
end;
$$;

-- Postgres lets anyone run a new function, and Supabase's API roles would get
-- it too. Only the secret key's role may.
revoke all on function public.use_trial_code(text) from public, anon, authenticated;
revoke all on function public.give_back_trial_code(text) from public, anon, authenticated;
grant execute on function public.use_trial_code(text) to service_role;
grant execute on function public.give_back_trial_code(text) to service_role;
