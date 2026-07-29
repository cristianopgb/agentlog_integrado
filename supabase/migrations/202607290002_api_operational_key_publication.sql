-- Corrige pareamentos canônicos identificadores já ativos sem inferir chaves
-- a partir do payload recebido.
update public.field_mappings fm
set operational_key = true,
    updated_at = now()
from public.canonical_fields cf
join public.canonical_entities ce
  on ce.id = cf.canonical_entity_id
 and ce.tenant_id = cf.tenant_id
where cf.id = fm.canonical_field_id
  and cf.tenant_id = fm.tenant_id
  and ce.entity_key = 'operation_records'
  and cf.field_key in (
    'delivery_number',
    'document_number',
    'external_code',
    'manifest_number',
    'invoice_number',
    'cte_number',
    'order_number'
  )
  and fm.status = 'active'
  and fm.mapping_type <> 'ignored'
  and fm.operational_key = false;

-- Os pareamentos de contrato criados automaticamente para APIs declaram a
-- chave somente quando o destino é um identificador canônico permitido.
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
  v_operational_key boolean;
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

  v_operational_key := v_canonical_field_key in (
    'delivery_number', 'document_number', 'external_code',
    'manifest_number', 'invoice_number', 'cte_number', 'order_number'
  );

  if v_entity_id is not null and v_field_id is not null then
    update public.field_mappings
    set canonical_entity_id = v_entity_id,
      canonical_field_id = v_field_id,
      mapping_type = 'direct',
      status = 'active',
      notes = 'Publicação canônica explícita do contrato nativo de entregas.',
      operational_key = v_operational_key,
      updated_at = now()
    where tenant_id = new.tenant_id
      and data_contract_id = new.data_contract_id
      and data_contract_field_id = new.id;

    if not found then
      insert into public.field_mappings (
        tenant_id, data_contract_id, data_contract_field_id,
        canonical_entity_id, canonical_field_id, mapping_type, status, notes,
        operational_key
      )
      select
        new.tenant_id, new.data_contract_id, new.id,
        v_entity_id, v_field_id, 'direct', 'active',
        'Publicação canônica explícita do contrato nativo de entregas.',
        v_operational_key
      where not exists (
        select 1
        from public.field_mappings fm
        where fm.tenant_id = new.tenant_id
          and fm.data_contract_id = new.data_contract_id
          and fm.data_contract_field_id = new.id
          and fm.status = 'active'
      );
    end if;
  end if;

  return new;
end;
$$;
