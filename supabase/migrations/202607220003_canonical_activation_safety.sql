-- A new spreadsheet batch is staged as pending until its normalization completes.
alter table public.operation_records drop constraint if exists operation_records_canonical_validity_status_check;
alter table public.operation_records add constraint operation_records_canonical_validity_status_check check (canonical_validity_status in ('valid','pending_activation','superseded','incomplete','invalid'));

-- Correct the generic source-system fallback from the first migration: data source wins over "staging".
update public.operation_records o set canonical_source_key=coalesce(nullif(trim(b.source_reference),''), nullif(trim(b.batch_code),''), o.source_data_source_id::text, nullif(trim(o.source_system),''))
from public.staging_batches b where b.id=o.source_staging_batch_id and b.tenant_id=o.tenant_id and (o.canonical_source_key is null or o.canonical_source_key='staging');

-- Backfill the logical integration required by the audited active spreadsheet dataset.
with integration as (
  insert into public.canonical_integrations (tenant_id, integration_type, canonical_source_key, dataset_role, module_scope, active_data_contract_id, active_schema_signature, status)
  select '0f1d1d04-e415-453b-b08c-5b5ca19ebb76'::uuid, 'spreadsheet', 'base_demo_indicadores_nativos.xlsx', 'deliveries', 'transporte', o.source_data_contract_id, 'legacy-pending-signature', 'active'
  from public.operation_records o
  where o.tenant_id='0f1d1d04-e415-453b-b08c-5b5ca19ebb76' and o.source_staging_batch_id='732a0381-8b50-4982-845b-8298448ce896'
  limit 1
  on conflict (tenant_id, integration_type, canonical_source_key, dataset_role) do update set status='active'
  returning id
)
update public.operation_records o set canonical_integration_id=i.id
from integration i
where o.tenant_id='0f1d1d04-e415-453b-b08c-5b5ca19ebb76' and o.source_staging_batch_id='732a0381-8b50-4982-845b-8298448ce896' and o.is_current=true and o.canonical_validity_status='valid';
