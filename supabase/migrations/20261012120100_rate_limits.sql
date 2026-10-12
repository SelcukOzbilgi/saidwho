-- How many runs each visitor started in the current window, shared by every
-- server instance (see src/lib/server/rate-limit.ts). A visitor is a keyed hash
-- of their address, never the address itself. A row is deleted by a later count
-- once its window has been over for an hour.
create table public.rate_limits (
  -- The limit's name and the visitor's hash, as in "trial:3f9a...".
  key text not null check (char_length(key) <= 100),
  window_start timestamptz not null,
  expires_at timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (key, window_start)
);

create index rate_limits_expires_at on public.rate_limits (expires_at);

-- As with runs: only the server, with the secret key, reaches this table.
alter table public.rate_limits enable row level security;

-- Supabase is moving new projects off granting new tables to the API roles by
-- default, so the grants are spelled out: the function below runs as the
-- server's role and needs these, and the public roles get nothing.
revoke all on table public.rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.rate_limits to service_role;

-- Counts one run and returns true, or returns false without counting when the
-- visitor already reached p_max in this window. Windows start on the epoch, so a
-- day's window starts at UTC midnight.
create function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_max < 1 or p_window_seconds < 1 then
    return false;
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  -- Windows that ended over an hour ago go, up to 500 rows a call. Not sooner: a
  -- call that worked out its window just before it ended may not have written
  -- yet, and deleting the row under it would let it start that window over at
  -- one. Rows another call is already deleting are skipped, so two calls never
  -- wait on each other here.
  delete from public.rate_limits
  where ctid in (
    select ctid from public.rate_limits
    where expires_at <= now() - interval '1 hour'
    limit 500
    for update skip locked
  );

  -- One statement, so two runs that start together can't both take the last
  -- place. The update only happens while the count is under the limit.
  insert into public.rate_limits as r (key, window_start, expires_at, hits)
  values (p_key, v_start, v_start + make_interval(secs => p_window_seconds), 1)
  on conflict (key, window_start) do update
    set hits = r.hits + 1
    where r.hits < p_max
  returning r.hits into v_hits;

  return v_hits is not null;
end;
$$;

-- Postgres lets anyone run a new function, and Supabase's API roles would get
-- it too. Only the secret key's role may.
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
