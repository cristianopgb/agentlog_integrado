-- Spreadsheet uploads are technical batches; canonical_integrations own the active operational dataset.
create table if not exists public.canonical_integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_type text not null default 'spreadsheet' check (integration_type in ('spreadsheet')),
  canonical_source_key text not null,
  dataset_role text not null default 'deliveries' check (dataset_role in ('deliveries','occurrences','finance','warehouse','team')),
  module_scope text not null default 'transporte',
  active_data_contract_id uuid references public.data_contracts(id) on delete set null,
  active_schema_signature text not null,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, integration_type, canonical_source_key, dataset_role)
);

alter table public.operation_records add column if not exists is_current boolean not null default true;
alter table public.operation_records add column if not exists superseded_at timestamptz;
alter table public.operation_records add column if not exists superseded_by_staging_batch_id uuid references public.staging_batches(id) on delete set null;
alter table public.operation_records add column if not exists canonical_source_key text;
alter table public.operation_records add column if not exists canonical_integration_id uuid references public.canonical_integrations(id) on delete set null;
alter table public.operation_records add column if not exists canonical_validity_status text not null default 'valid';
do $$ begin alter table public.operation_records add constraint operation_records_canonical_validity_status_check check (canonical_validity_status in ('valid','superseded','incomplete','invalid')); exception when duplicate_object then null; end $$;
alter table public.normalization_errors drop constraint if exists normalization_errors_code_check;
alter table public.normalization_errors add constraint normalization_errors_code_check check (error_code in ('NO_VALID_RECORDS','NO_FIELD_MAPPINGS','INVALID_STAGING_BATCH','INVALID_STAGING_RECORD','MISSING_OPERATION_RECORD','INVALID_CANONICAL_ENTITY','INVALID_CANONICAL_FIELD','INVALID_VALUE_TYPE','REQUIRED_VALUE_MISSING','MODULE_NOT_ENABLED','UPSERT_FAILED','UNKNOWN_ERROR','FIELD_MAPPING_LOAD_FAILED','INVALID_CANONICAL_VALUE','SCHEMA_INCOMPATIBLE'));
create index if not exists idx_operation_records_current_valid on public.operation_records(tenant_id, is_current, canonical_validity_status) where deleted_at is null;
create index if not exists idx_operation_records_canonical_integration on public.operation_records(tenant_id, canonical_integration_id, is_current) where deleted_at is null;
create index if not exists idx_canonical_integrations_active on public.canonical_integrations(tenant_id, canonical_source_key, dataset_role) where status='active';
drop trigger if exists set_canonical_integrations_updated_at on public.canonical_integrations;
create trigger set_canonical_integrations_updated_at before update on public.canonical_integrations for each row execute function public.set_updated_at();
alter table public.canonical_integrations enable row level security;
drop policy if exists "members can manage canonical integrations" on public.canonical_integrations;
create policy "members can manage canonical integrations" on public.canonical_integrations for all to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'normalization.run')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'normalization.run'));

-- Backfill the stable source key from the batch, never from a transient data source id when a filename exists.
update public.operation_records o set canonical_source_key = coalesce(nullif(trim(b.source_reference),''), nullif(trim(b.batch_code),''), nullif(trim(o.source_system),''), o.source_data_source_id::text)
from public.staging_batches b where b.id=o.source_staging_batch_id and b.tenant_id=o.tenant_id and o.canonical_source_key is null;

-- Defensive historic cleanup: invalid delivery rows are never current.
update public.operation_records o set is_current=false, canonical_validity_status='incomplete', superseded_at=coalesce(o.superseded_at, now())
where o.deleted_at is null and not exists (select 1 from unnest(array[o.delivery_number,o.manifest_number,o.invoice_number,o.cte_number,o.order_number,o.external_code]) as key where nullif(trim(key),'') is not null);

-- Production audit repair for the known spreadsheet history, constrained by tenant and batch ids.
update public.operation_records set canonical_source_key='base_demo_indicadores_nativos.xlsx', is_current=true, canonical_validity_status='valid', superseded_at=null, superseded_by_staging_batch_id=null
where tenant_id='0f1d1d04-e415-453b-b08c-5b5ca19ebb76' and source_staging_batch_id='732a0381-8b50-4982-845b-8298448ce896';
update public.operation_records set canonical_source_key='base_demo_indicadores_nativos.xlsx', is_current=false, canonical_validity_status='superseded', superseded_at=coalesce(superseded_at,now()), superseded_by_staging_batch_id='732a0381-8b50-4982-845b-8298448ce896'
where tenant_id='0f1d1d04-e415-453b-b08c-5b5ca19ebb76' and source_staging_batch_id in ('5d40d3b4-6f10-4d19-b5f3-34b3ae741cd0','9de52a97-c7c8-4820-8424-e47cfc9778f1');
update public.operation_records set is_current=false, canonical_validity_status='incomplete', superseded_at=coalesce(superseded_at,now())
where tenant_id='0f1d1d04-e415-453b-b08c-5b5ca19ebb76' and source_staging_batch_id='8b706275-5e78-431d-920b-0f1ed96dcafb';
