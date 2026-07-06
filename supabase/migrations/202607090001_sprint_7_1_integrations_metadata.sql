alter table public.data_sources add column if not exists metadata jsonb not null default '{}'::jsonb;
