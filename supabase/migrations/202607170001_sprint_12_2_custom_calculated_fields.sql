-- Sprint 12.2 — Campos calculados personalizados controlados
create table if not exists public.custom_calculated_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  module_key text not null,
  field_key text not null,
  calculation_kind text not null,
  formula_config jsonb not null default '{}'::jsonb,
  formula_preview text not null default '',
  value_format text not null default 'number',
  decimal_places integer not null default 2,
  status text not null default 'draft',
  available_for_indicators boolean not null default false,
  available_for_dashboard boolean not null default false,
  available_for_reports boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint custom_calculated_fields_status_check check (status in ('draft','active','inactive')),
  constraint custom_calculated_fields_kind_check check (calculation_kind in ('row_calculated_field','aggregate_calculated_measure')),
  constraint custom_calculated_fields_decimal_places_check check (decimal_places between 0 and 8),
  constraint custom_calculated_fields_tenant_field_key_unique unique (tenant_id, field_key)
);

alter table public.custom_calculated_fields enable row level security;
create index if not exists idx_custom_calculated_fields_tenant_status on public.custom_calculated_fields(tenant_id, status) where deleted_at is null;
drop trigger if exists set_custom_calculated_fields_updated_at on public.custom_calculated_fields;
create trigger set_custom_calculated_fields_updated_at before update on public.custom_calculated_fields for each row execute function public.set_updated_at();


create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select up.active_tenant_id
  from public.users_profile up
  where up.id = auth.uid()
  limit 1
$$;

revoke all on function public.current_tenant_id() from public;
grant execute on function public.current_tenant_id() to authenticated;

drop policy if exists custom_calculated_fields_tenant_select on public.custom_calculated_fields;
create policy custom_calculated_fields_tenant_select on public.custom_calculated_fields for select using (public.current_tenant_id() = tenant_id);
drop policy if exists custom_calculated_fields_tenant_insert on public.custom_calculated_fields;
create policy custom_calculated_fields_tenant_insert on public.custom_calculated_fields for insert with check (public.current_tenant_id() = tenant_id);
drop policy if exists custom_calculated_fields_tenant_update on public.custom_calculated_fields;
create policy custom_calculated_fields_tenant_update on public.custom_calculated_fields for update using (public.current_tenant_id() = tenant_id) with check (public.current_tenant_id() = tenant_id);
