-- Every run, saved with what it found, so it gets a public link (/runs/<id>).
-- Events hold the quote, the snippets found and the verdict; never keys or page text.
create table public.runs (
  -- The same pattern as RUN_ID_PATTERN in src/lib/run-id.ts.
  id text primary key check (id ~ '^[A-Za-z0-9_-]{11}$'),
  created_at timestamptz not null default now(),
  -- Whose keys paid: the visitor's own, or the server's trial keys.
  keys text not null check (keys in ('own', 'trial')),
  events jsonb not null check (jsonb_typeof(events) = 'array')
);

-- Only the server reads and writes, with the secret key, which bypasses row level
-- security. With RLS on and no policies, the public API keys can do nothing here.
alter table public.runs enable row level security;
