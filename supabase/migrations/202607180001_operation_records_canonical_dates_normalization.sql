-- Corrige os pareamentos de datas canônicas do tenant AgentLog para que a
-- normalização preserve datas comuns em operation_records sem remover
-- pareamentos válidos para tabelas de extensão.

-- O mesmo campo de contrato pode alimentar a base comum e uma extensão.
do $$
begin
  alter table public.field_mappings
    drop constraint if exists field_mappings_data_contract_id_data_contract_field_id_key;
end $$;

-- Remove apenas duplicados exatos ativos do mesmo contrato/campo/entidade/campo canônico.
-- Mantém o registro ativo direto mais recente; pareamentos para entidades diferentes são preservados.
with ranked as (
  select
    fm.id,
    row_number() over (
      partition by
        fm.tenant_id,
        fm.data_contract_id,
        fm.data_contract_field_id,
        fm.canonical_entity_id,
        fm.canonical_field_id
      order by
        case when fm.status = 'active' then 0 else 1 end,
        case when fm.mapping_type = 'direct' then 0 else 1 end,
        fm.updated_at desc,
        fm.created_at desc,
        fm.id desc
    ) as rn
  from public.field_mappings fm
  join public.tenants t on t.id = fm.tenant_id
  where t.slug = 'agentlog'
    and fm.status = 'active'
)
delete from public.field_mappings fm
using ranked r
where fm.id = r.id
  and r.rn > 1;

-- Garante que duplicados exatos ativos não retornem após a correção.
create unique index if not exists idx_field_mappings_active_exact_target_unique
  on public.field_mappings (
    tenant_id,
    data_contract_id,
    data_contract_field_id,
    canonical_entity_id,
    canonical_field_id
  )
  where status = 'active';

-- Reativa pareamentos exatos já existentes para as datas comuns de operation_records.
with target_mapping(source_field_key, source_field_name, canonical_field_key) as (
  values
    ('data_de_emissao', 'Data de emissão', 'issued_at'),
    ('data_prevista', 'Data prevista', 'expected_date'),
    ('data_de_entrega', 'Data de entrega', 'completed_at')
), desired as (
  select
    dcf.tenant_id,
    dcf.data_contract_id,
    dcf.id as data_contract_field_id,
    ce.id as canonical_entity_id,
    cf.id as canonical_field_id,
    tm.canonical_field_key
  from target_mapping tm
  join public.tenants t on t.slug = 'agentlog'
  join public.data_contract_fields dcf on dcf.tenant_id = t.id
    and (
      dcf.field_key = tm.source_field_key
      or dcf.source_field_name = tm.source_field_name
    )
  join public.canonical_entities ce on ce.tenant_id = dcf.tenant_id
    and ce.entity_key = 'operation_records'
  join public.canonical_fields cf on cf.tenant_id = dcf.tenant_id
    and cf.canonical_entity_id = ce.id
    and cf.field_key = tm.canonical_field_key
)
update public.field_mappings fm
set
  mapping_type = 'direct',
  status = 'active',
  notes = coalesce(fm.notes, 'Correção de datas canônicas para operation_records.'),
  updated_at = now()
from desired d
where fm.tenant_id = d.tenant_id
  and fm.data_contract_id = d.data_contract_id
  and fm.data_contract_field_id = d.data_contract_field_id
  and fm.canonical_entity_id = d.canonical_entity_id
  and fm.canonical_field_id = d.canonical_field_id;

-- Insere somente pareamentos canônicos ausentes; não cria dados operacionais.
with target_mapping(source_field_key, source_field_name, canonical_field_key) as (
  values
    ('data_de_emissao', 'Data de emissão', 'issued_at'),
    ('data_prevista', 'Data prevista', 'expected_date'),
    ('data_de_entrega', 'Data de entrega', 'completed_at')
), desired as (
  select
    dcf.tenant_id,
    dcf.data_contract_id,
    dcf.id as data_contract_field_id,
    ce.id as canonical_entity_id,
    cf.id as canonical_field_id
  from target_mapping tm
  join public.tenants t on t.slug = 'agentlog'
  join public.data_contract_fields dcf on dcf.tenant_id = t.id
    and (
      dcf.field_key = tm.source_field_key
      or dcf.source_field_name = tm.source_field_name
    )
  join public.canonical_entities ce on ce.tenant_id = dcf.tenant_id
    and ce.entity_key = 'operation_records'
  join public.canonical_fields cf on cf.tenant_id = dcf.tenant_id
    and cf.canonical_entity_id = ce.id
    and cf.field_key = tm.canonical_field_key
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
  d.tenant_id,
  d.data_contract_id,
  d.data_contract_field_id,
  d.canonical_entity_id,
  d.canonical_field_id,
  'direct',
  'active',
  'Correção de datas canônicas para operation_records.'
from desired d
where not exists (
  select 1
  from public.field_mappings fm
  where fm.tenant_id = d.tenant_id
    and fm.data_contract_id = d.data_contract_id
    and fm.data_contract_field_id = d.data_contract_field_id
    and fm.canonical_entity_id = d.canonical_entity_id
    and fm.canonical_field_id = d.canonical_field_id
);
