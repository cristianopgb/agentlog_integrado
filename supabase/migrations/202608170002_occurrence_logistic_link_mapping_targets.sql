-- Expose every supported tenant logistic key as an importable occurrence link.
with fields(field_key,name,sort_order) as (values
  ('linked_delivery_number','Documento da entrega vinculada',421),
  ('linked_document_number','Documento operacional vinculado',418),
  ('linked_invoice_number','NF vinculada',419),
  ('linked_cte_number','CT-e vinculada',420),
  ('linked_manifest_number','Manifesto / Romaneio vinculado',430),
  ('linked_order_number','Pedido vinculado',431)
)
insert into public.canonical_fields
  (tenant_id,canonical_entity_id,field_key,name,data_type,is_required,is_system,is_importable,is_analytics_only,sort_order)
select e.tenant_id,e.id,f.field_key,f.name,'text',false,true,true,false,f.sort_order
from public.canonical_entities e cross join fields f
where e.entity_key='occurrences'
on conflict (canonical_entity_id,field_key) do update
set name=excluded.name,
    data_type='text',
    is_system=true,
    is_importable=true,
    is_analytics_only=false,
    sort_order=excluded.sort_order,
    updated_at=now();
