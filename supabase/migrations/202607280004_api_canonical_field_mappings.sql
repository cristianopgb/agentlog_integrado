alter table public.normalization_errors
  drop constraint if exists normalization_errors_code_check;

alter table public.normalization_errors
  add constraint normalization_errors_code_check
  check (error_code in (
    'NO_VALID_RECORDS',
    'NO_VALID_STAGING_RECORDS',
    'EMPTY_NORMALIZED_PAYLOAD',
    'NO_CANONICAL_FIELD_MAPPINGS',
    'NO_FIELD_MAPPINGS',
    'INVALID_STAGING_BATCH',
    'INVALID_STAGING_RECORD',
    'MISSING_OPERATION_RECORD',
    'INVALID_CANONICAL_ENTITY',
    'INVALID_CANONICAL_FIELD',
    'INVALID_VALUE_TYPE',
    'REQUIRED_VALUE_MISSING',
    'MODULE_NOT_ENABLED',
    'UPSERT_FAILED',
    'UNKNOWN_ERROR',
    'FIELD_MAPPING_LOAD_FAILED',
    'INVALID_CANONICAL_VALUE',
    'SCHEMA_INCOMPATIBLE'
  )) not valid;

-- Catálogo explícito da estrutura nativa inicial de entregas. Este seed cria
-- somente a publicação contrato -> base canônica; não representa campos da API.
with canonical_map(contract_field_key, canonical_field_key) as (
  values
    ('numero_entrega', 'delivery_number'),
    ('documento_cliente', 'customer_document'),
    ('nome_cliente', 'customer_name'),
    ('status_entrega', 'status'),
    ('data_emissao', 'issued_at'),
    ('data_prevista', 'expected_date'),
    ('data_entrega', 'completed_at'),
    ('valor_frete', 'freight_value'),
    ('valor_total', 'total_value')
)
insert into public.field_mappings (
  tenant_id,
  data_contract_id,
  data_contract_field_id,
  canonical_entity_id,
  canonical_field_id,
  mapping_type,
  status,
  notes
)
select
  dc.tenant_id,
  dc.id,
  dcf.id,
  ce.id,
  cf.id,
  'direct',
  'active',
  'Publicação canônica explícita do contrato nativo de entregas.'
from public.data_contracts dc
join public.data_sources ds
  on ds.id = dc.data_source_id
 and ds.tenant_id = dc.tenant_id
 and ds.source_type = 'api'
join public.data_contract_fields dcf
  on dcf.data_contract_id = dc.id
 and dcf.tenant_id = dc.tenant_id
join canonical_map cm
  on cm.contract_field_key = dcf.field_key
join public.canonical_entities ce
  on ce.tenant_id = dc.tenant_id
 and ce.entity_key = 'operation_records'
 and ce.status = 'active'
join public.canonical_fields cf
  on cf.tenant_id = dc.tenant_id
 and cf.canonical_entity_id = ce.id
 and cf.field_key = cm.canonical_field_key
where dc.entity_key = 'deliveries'
  and dc.status = 'active'
on conflict (data_contract_id, data_contract_field_id)
do update set
  canonical_entity_id = excluded.canonical_entity_id,
  canonical_field_id = excluded.canonical_field_id,
  mapping_type = excluded.mapping_type,
  status = excluded.status,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.ensure_api_delivery_canonical_mapping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical_field_key text;
  v_entity_id uuid;
  v_field_id uuid;
begin
  select case new.field_key
    when 'numero_entrega' then 'delivery_number'
    when 'documento_cliente' then 'customer_document'
    when 'nome_cliente' then 'customer_name'
    when 'status_entrega' then 'status'
    when 'data_emissao' then 'issued_at'
    when 'data_prevista' then 'expected_date'
    when 'data_entrega' then 'completed_at'
    when 'valor_frete' then 'freight_value'
    when 'valor_total' then 'total_value'
  end into v_canonical_field_key;

  if v_canonical_field_key is null or not exists (
    select 1
    from public.data_contracts dc
    join public.data_sources ds
      on ds.id = dc.data_source_id
     and ds.tenant_id = dc.tenant_id
    where dc.id = new.data_contract_id
      and dc.tenant_id = new.tenant_id
      and dc.entity_key = 'deliveries'
      and ds.source_type = 'api'
  ) then
    return new;
  end if;

  select ce.id, cf.id
    into v_entity_id, v_field_id
  from public.canonical_entities ce
  join public.canonical_fields cf
    on cf.canonical_entity_id = ce.id
   and cf.tenant_id = ce.tenant_id
  where ce.tenant_id = new.tenant_id
    and ce.entity_key = 'operation_records'
    and ce.status = 'active'
    and cf.field_key = v_canonical_field_key
  limit 1;

  if v_entity_id is not null and v_field_id is not null then
    insert into public.field_mappings (
      tenant_id, data_contract_id, data_contract_field_id,
      canonical_entity_id, canonical_field_id, mapping_type, status, notes
    ) values (
      new.tenant_id, new.data_contract_id, new.id,
      v_entity_id, v_field_id, 'direct', 'active',
      'Publicação canônica explícita do contrato nativo de entregas.'
    )
    on conflict (data_contract_id, data_contract_field_id)
    do update set
      canonical_entity_id = excluded.canonical_entity_id,
      canonical_field_id = excluded.canonical_field_id,
      mapping_type = 'direct',
      status = 'active',
      notes = excluded.notes,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_api_delivery_canonical_mapping
  on public.data_contract_fields;
create trigger ensure_api_delivery_canonical_mapping
after insert or update of field_key, data_contract_id
on public.data_contract_fields
for each row execute function public.ensure_api_delivery_canonical_mapping();
