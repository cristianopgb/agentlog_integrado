-- A chave de publicação é uma decisão declarativa do pareamento canônico.
-- Ela nunca é inferida do nome do campo recebido nem do raw_payload.
alter table public.field_mappings
  add column if not exists operational_key boolean not null default false;

create index if not exists idx_field_mappings_operational_key
  on public.field_mappings (tenant_id, data_contract_id)
  where operational_key = true and status = 'active';

-- Preserva contratos existentes marcando seus identificadores canônicos já
-- pareados. O usuário pode alterar esta escolha pelo setup de pareamento.
update public.field_mappings fm
set operational_key = true,
    updated_at = now()
from public.canonical_fields cf
where cf.id = fm.canonical_field_id
  and cf.tenant_id = fm.tenant_id
  and fm.mapping_type <> 'ignored'
  and fm.status = 'active'
  and cf.field_key in (
    'delivery_number',
    'document_number',
    'external_code',
    'manifest_number',
    'invoice_number',
    'cte_number',
    'order_number'
  );

comment on column public.field_mappings.operational_key is
  'Marca explicitamente o campo canônico usado como chave mínima de publicação do contrato.';
