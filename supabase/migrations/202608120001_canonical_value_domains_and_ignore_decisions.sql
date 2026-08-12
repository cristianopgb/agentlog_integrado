-- Decisões auditáveis de ignore e catálogo exclusivamente nativo.
alter table public.data_source_value_mappings alter column target_value drop not null;
alter table public.data_source_value_mappings drop constraint if exists data_source_value_mappings_status_check;
alter table public.data_source_value_mappings drop constraint if exists data_source_value_mappings_check;
alter table public.data_source_value_mappings drop constraint if exists data_source_value_mappings_target_check;
alter table public.data_source_value_mappings add constraint data_source_value_mappings_status_check
  check (status in ('active','ignored_value','revoked'));
alter table public.data_source_value_mappings add constraint data_source_value_mappings_target_check
  check ((status = 'ignored_value' and target_value is null) or (status <> 'ignored_value' and target_value is not null and target_value <> ''));

alter table public.data_source_api_field_mappings add column if not exists ignored_by uuid references auth.users(id) on delete set null;
alter table public.data_source_api_field_mappings add column if not exists ignored_at timestamptz;
alter table public.data_source_api_field_mappings drop constraint if exists data_source_api_field_mappings_status_check;
alter table public.data_source_api_field_mappings add constraint data_source_api_field_mappings_status_check
  check (status in ('active','inactive','ignored_field'));

with native_domain(entity_key,field_key,value,label,sort_order) as (values
 ('operation_records','delivery_status','pending','Pendente',0),('operation_records','delivery_status','scheduled','Agendada',1),('operation_records','delivery_status','in_transit','Em trânsito',2),('operation_records','delivery_status','delivered','Entregue',3),('operation_records','delivery_status','delayed','Atrasada',4),('operation_records','delivery_status','failed','Falha',5),('operation_records','delivery_status','canceled','Cancelada',6),
 ('operation_records','status','pending','Pendente',0),('operation_records','status','active','Ativa',1),('operation_records','status','completed','Concluída',2),('operation_records','status','blocked','Bloqueada',3),('operation_records','status','canceled','Cancelada',4),
 ('operation_records','priority','low','Baixa',0),('operation_records','priority','normal','Normal',1),('operation_records','priority','high','Alta',2),('operation_records','priority','urgent','Urgente',3),
 ('transport_records','pod_status','not_required','Não obrigatório',0),('transport_records','pod_status','pending','Pendente',1),('transport_records','pod_status','received','Recebido',2),('transport_records','pod_status','validated','Validado',3),('transport_records','pod_status','rejected','Rejeitado',4),('transport_records','pod_status','expired','Vencido',5),
 ('finance_records','billing_status','pending','Pendente',0),('finance_records','billing_status','blocked','Bloqueado',1),('finance_records','billing_status','released','Liberado',2),('finance_records','billing_status','billed','Faturado',3),('finance_records','billing_status','canceled','Cancelado',4),
 ('finance_records','payment_status','pending','Pendente',0),('finance_records','payment_status','scheduled','Agendado',1),('finance_records','payment_status','paid','Pago',2),('finance_records','payment_status','overdue','Vencido',3),('finance_records','payment_status','canceled','Cancelado',4),
 ('finance_records','billing_block_status','none','Sem bloqueio',0),('finance_records','billing_block_status','blocked','Bloqueado',1),('finance_records','billing_block_status','released','Liberado',2),
 ('finance_records','financial_approval_status','pending','Pendente',0),('finance_records','financial_approval_status','approved','Aprovado',1),('finance_records','financial_approval_status','rejected','Rejeitado',2)
)
insert into public.data_contract_allowed_values(tenant_id,data_contract_id,data_contract_field_id,value,label,normalized_value,is_active,sort_order)
select fm.tenant_id,fm.data_contract_id,fm.data_contract_field_id,d.value,d.label,d.value,true,d.sort_order
from public.field_mappings fm
join public.canonical_entities ce on ce.id=fm.canonical_entity_id and ce.tenant_id=fm.tenant_id
join public.canonical_fields cf on cf.id=fm.canonical_field_id and cf.tenant_id=fm.tenant_id
join native_domain d on d.entity_key=ce.entity_key and d.field_key=cf.field_key
where fm.status='active' and cf.is_importable=true and cf.is_analytics_only=false
  and not exists (
    select 1
    from public.data_contract_allowed_values existing
    where existing.data_contract_field_id = fm.data_contract_field_id
      and existing.value = d.value
  );
