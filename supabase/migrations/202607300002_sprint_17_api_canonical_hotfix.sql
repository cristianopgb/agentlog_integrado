-- Sprint 17: publicação canônica de entregas API e proteção de versão vigente.
alter table public.operation_records add column if not exists shipper_external_id text;
alter table public.operation_records add column if not exists carrier_external_id text;
alter table public.operation_records add column if not exists carrier_name text;
alter table public.operation_records add column if not exists service_taker_external_id text;
alter table public.operation_records add column if not exists service_taker_name text;
alter table public.operation_records add column if not exists scheduled_at timestamptz;
alter table public.operation_records add column if not exists vehicle_profile text;
alter table public.operation_records add column if not exists pending_volume_count numeric;
alter table public.operation_records add column if not exists pending_total_value numeric;
alter table public.operation_records add column if not exists pending_gross_weight numeric;

with field_seed(field_key, name, data_type, sort_order) as (
  values
    ('shipper_external_id', 'ID do embarcador', 'text', 300),
    ('shipper_name', 'Embarcador', 'text', 310),
    ('carrier_external_id', 'ID da transportadora', 'text', 320),
    ('carrier_name', 'Transportadora', 'text', 330),
    ('service_taker_external_id', 'ID do tomador', 'text', 340),
    ('service_taker_name', 'Tomador', 'text', 350),
    ('scheduled_at', 'Data de agendamento', 'datetime', 360),
    ('vehicle_profile', 'Perfil do veículo', 'text', 370),
    ('pending_volume_count', 'Volume pendente', 'decimal', 380),
    ('pending_total_value', 'Valor pendente', 'decimal', 390),
    ('pending_gross_weight', 'Peso pendente', 'decimal', 400)
)
insert into public.canonical_fields
  (tenant_id, canonical_entity_id, field_key, name, data_type, is_required, is_system, sort_order)
select ce.tenant_id, ce.id, fs.field_key, fs.name, fs.data_type, false, true, fs.sort_order
from public.canonical_entities ce cross join field_seed fs
where ce.entity_key = 'operation_records' and ce.status = 'active'
on conflict (canonical_entity_id, field_key) do nothing;

-- Only source fields that really exist in an API delivery contract are mapped.
with canonical_map(source_key, canonical_key, operational_key) as (
  values
    ('numero_entrega', 'delivery_number', true),
    ('documento_cliente', 'customer_document', false), ('nome_cliente', 'customer_name', false),
    ('status_entrega', 'status', false), ('data_emissao', 'issued_at', false),
    ('data_prevista', 'expected_date', false), ('data_entrega', 'completed_at', false),
    ('valor_frete', 'freight_value', false), ('valor_total', 'total_value', false),
    ('motorista', 'driver_name', false), ('veiculo', 'vehicle_plate', false),
    ('cidade_origem', 'origin_city', false), ('cidade_destino', 'destination_city', false),
    ('uf_origem', 'origin_state', false), ('uf_destino', 'destination_state', false),
    ('peso_total', 'gross_weight', false), ('quantidade_volumes', 'volume_count', false),
    ('embarcador_id', 'shipper_external_id', false), ('shipper_id', 'shipper_external_id', false),
    ('embarcador', 'shipper_name', false), ('shipper_name', 'shipper_name', false),
    ('transportadora_id', 'carrier_external_id', false), ('carrier_id', 'carrier_external_id', false),
    ('transportadora', 'carrier_name', false), ('carrier_name', 'carrier_name', false),
    ('tomador_id', 'service_taker_external_id', false), ('service_taker_id', 'service_taker_external_id', false),
    ('tomador', 'service_taker_name', false), ('service_taker_name', 'service_taker_name', false),
    ('data_agendamento', 'scheduled_at', false), ('scheduled_at', 'scheduled_at', false),
    ('perfil_veiculo', 'vehicle_profile', false), ('vehicle_profile', 'vehicle_profile', false),
    ('volume_pendente', 'pending_volume_count', false), ('pending_volume_count', 'pending_volume_count', false),
    ('valor_pendente', 'pending_total_value', false), ('pending_total_value', 'pending_total_value', false),
    ('peso_pendente', 'pending_gross_weight', false), ('pending_gross_weight', 'pending_gross_weight', false)
)
insert into public.field_mappings
  (tenant_id, data_contract_id, data_contract_field_id, canonical_entity_id,
   canonical_field_id, mapping_type, status, notes, operational_key)
select dc.tenant_id, dc.id, dcf.id, ce.id, cf.id, 'direct', 'active',
       'Pareamento determinístico do contrato API deliveries.', cm.operational_key
from public.data_contracts dc
join public.data_sources ds on ds.id = dc.data_source_id and ds.tenant_id = dc.tenant_id and ds.source_type = 'api'
join public.data_contract_fields dcf on dcf.data_contract_id = dc.id and dcf.tenant_id = dc.tenant_id
join canonical_map cm on cm.source_key = dcf.field_key
join public.canonical_entities ce on ce.tenant_id = dc.tenant_id and ce.entity_key = 'operation_records' and ce.status = 'active'
join public.canonical_fields cf on cf.tenant_id = dc.tenant_id and cf.canonical_entity_id = ce.id and cf.field_key = cm.canonical_key
where dc.entity_key = 'deliveries' and dc.status = 'active'
on conflict (data_contract_id, data_contract_field_id) do update set
  canonical_entity_id = excluded.canonical_entity_id,
  canonical_field_id = excluded.canonical_field_id,
  mapping_type = 'direct', status = 'active', notes = excluded.notes,
  operational_key = excluded.operational_key, updated_at = now();

-- Repair pre-existing duplicate current versions without deleting audit history.
with ranked as (
  select id, row_number() over (
    partition by tenant_id, source_data_source_id, canonical_integration_id, delivery_number
    order by updated_at desc, created_at desc, id desc
  ) as position
  from public.operation_records
  where deleted_at is null and is_current = true and canonical_validity_status = 'valid'
    and source_data_source_id is not null and canonical_integration_id is not null
    and nullif(trim(delivery_number), '') is not null
)
update public.operation_records o set
  is_current = false, canonical_validity_status = 'superseded',
  superseded_at = coalesce(o.superseded_at, now()), updated_at = now()
from ranked r where r.id = o.id and r.position > 1;

create unique index if not exists uq_operation_records_api_delivery_current
  on public.operation_records
    (tenant_id, source_data_source_id, canonical_integration_id, delivery_number)
  where deleted_at is null and is_current = true and canonical_validity_status = 'valid'
    and source_data_source_id is not null and canonical_integration_id is not null
    and nullif(trim(delivery_number), '') is not null;

-- Extend the existing automatic mapper for future contract fields.
create or replace function public.ensure_api_delivery_canonical_mapping()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text; v_entity uuid; v_field uuid; v_operational boolean := false;
begin
  v_key := case new.field_key
    when 'numero_entrega' then 'delivery_number' when 'documento_cliente' then 'customer_document'
    when 'nome_cliente' then 'customer_name' when 'status_entrega' then 'status'
    when 'data_emissao' then 'issued_at' when 'data_prevista' then 'expected_date'
    when 'data_entrega' then 'completed_at' when 'valor_frete' then 'freight_value'
    when 'valor_total' then 'total_value' when 'motorista' then 'driver_name'
    when 'veiculo' then 'vehicle_plate' when 'cidade_origem' then 'origin_city'
    when 'cidade_destino' then 'destination_city' when 'uf_origem' then 'origin_state'
    when 'uf_destino' then 'destination_state' when 'peso_total' then 'gross_weight'
    when 'quantidade_volumes' then 'volume_count'
    when 'embarcador_id' then 'shipper_external_id' when 'shipper_id' then 'shipper_external_id'
    when 'embarcador' then 'shipper_name' when 'shipper_name' then 'shipper_name'
    when 'transportadora_id' then 'carrier_external_id' when 'carrier_id' then 'carrier_external_id'
    when 'transportadora' then 'carrier_name' when 'carrier_name' then 'carrier_name'
    when 'tomador_id' then 'service_taker_external_id' when 'service_taker_id' then 'service_taker_external_id'
    when 'tomador' then 'service_taker_name' when 'service_taker_name' then 'service_taker_name'
    when 'data_agendamento' then 'scheduled_at' when 'scheduled_at' then 'scheduled_at'
    when 'perfil_veiculo' then 'vehicle_profile' when 'vehicle_profile' then 'vehicle_profile'
    when 'volume_pendente' then 'pending_volume_count' when 'pending_volume_count' then 'pending_volume_count'
    when 'valor_pendente' then 'pending_total_value' when 'pending_total_value' then 'pending_total_value'
    when 'peso_pendente' then 'pending_gross_weight' when 'pending_gross_weight' then 'pending_gross_weight'
  end;
  v_operational := new.field_key = 'numero_entrega';
  if v_key is null or not exists (
    select 1 from public.data_contracts dc join public.data_sources ds
      on ds.id=dc.data_source_id and ds.tenant_id=dc.tenant_id
    where dc.id=new.data_contract_id and dc.tenant_id=new.tenant_id
      and dc.entity_key='deliveries' and ds.source_type='api') then return new; end if;
  select ce.id, cf.id into v_entity, v_field from public.canonical_entities ce
  join public.canonical_fields cf on cf.canonical_entity_id=ce.id and cf.tenant_id=ce.tenant_id
  where ce.tenant_id=new.tenant_id and ce.entity_key='operation_records'
    and ce.status='active' and cf.field_key=v_key limit 1;
  if v_entity is not null and v_field is not null then
    insert into public.field_mappings
      (tenant_id,data_contract_id,data_contract_field_id,canonical_entity_id,canonical_field_id,mapping_type,status,notes,operational_key)
    values (new.tenant_id,new.data_contract_id,new.id,v_entity,v_field,'direct','active',
      'Pareamento determinístico do contrato API deliveries.',v_operational)
    on conflict (data_contract_id,data_contract_field_id) do update set
      canonical_entity_id=excluded.canonical_entity_id,canonical_field_id=excluded.canonical_field_id,
      mapping_type='direct',status='active',notes=excluded.notes,
      operational_key=excluded.operational_key,updated_at=now();
  end if;
  return new;
end $$;
