-- Sprint 10R-G hotfix hardening: repair lifecycle and canonical enum domains
-- for sources that published before the setup-flow fixes were deployed.

update public.data_sources ds
set status = 'active',
    module_key = case
      when jsonb_typeof(ds.metadata->'module_keys') = 'array'
       and jsonb_array_length(ds.metadata->'module_keys') > 1 then 'core'
      else ds.module_key
    end,
    updated_at = now()
where ds.source_type = 'api'
  and ds.status = 'configuring'
  and exists (
    select 1
    from public.operation_records op
    where op.tenant_id = ds.tenant_id
      and op.source_data_source_id = ds.id
      and op.deleted_at is null
      and op.is_current = true
      and op.canonical_validity_status = 'valid'
  );

with delivery_status_fields as (
  select distinct dcf.tenant_id, dcf.data_contract_id, dcf.id as data_contract_field_id
  from public.data_contract_fields dcf
  join public.field_mappings fm
    on fm.tenant_id = dcf.tenant_id
   and fm.data_contract_id = dcf.data_contract_id
   and fm.data_contract_field_id = dcf.id
   and fm.status = 'active'
  join public.canonical_entities ce
    on ce.tenant_id = fm.tenant_id
   and ce.id = fm.canonical_entity_id
   and ce.entity_key = 'operation_records'
  join public.canonical_fields cf
    on cf.tenant_id = fm.tenant_id
   and cf.id = fm.canonical_field_id
   and cf.canonical_entity_id = ce.id
   and cf.field_key = 'delivery_status'
), native_values(value, label, sort_order) as (values
  ('pending','pending',0), ('scheduled','scheduled',1),
  ('in_transit','in_transit',2), ('delivered','delivered',3),
  ('delayed','delayed',4), ('failed','failed',5), ('canceled','canceled',6)
)
insert into public.data_contract_allowed_values
  (tenant_id, data_contract_id, data_contract_field_id, value, label, is_active, sort_order)
select f.tenant_id, f.data_contract_id, f.data_contract_field_id,
       v.value, v.label, true, v.sort_order
from delivery_status_fields f
cross join native_values v
where not exists (
  select 1 from public.data_contract_allowed_values av
  where av.tenant_id = f.tenant_id
    and av.data_contract_id = f.data_contract_id
    and av.data_contract_field_id = f.data_contract_field_id
    and av.value = v.value
);
