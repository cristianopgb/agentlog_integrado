alter table if exists public.staging_batches
  add column if not exists api_revalidated_at timestamptz;

alter table if exists public.staging_batches
  add column if not exists api_revalidated_by uuid;
