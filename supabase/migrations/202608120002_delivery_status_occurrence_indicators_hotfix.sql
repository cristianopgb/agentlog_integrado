-- Hotfix: preserve delivery status target and expose the safe occurrence analytics catalog.
alter table public.operation_records add column if not exists delivery_status text;

-- Keep the already-created canonical field aligned without changing its domain.
update public.canonical_fields cf
set name='Status da entrega', data_type='enum', updated_at=now()
from public.canonical_entities ce
where ce.id=cf.canonical_entity_id
  and ce.entity_key='operation_records'
  and cf.field_key='delivery_status';

with fields(field_key,label,data_type,semantic_type,is_dimension,is_measure,allowed_operations,allowed_filters) as (values
 ('occurrence_number','Número da ocorrência','text','identifier',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('current_status','Status','text','status',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('current_priority','Prioridade','text','status',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('source_channel','Canal de origem','text','channel',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('opened_at','Data de abertura','date','date',false,false,'["CONTAGEM"]'::jsonb,'["entre","preenchido","não preenchido"]'::jsonb),
 ('due_at','Prazo','date','date',false,false,'["CONTAGEM"]'::jsonb,'["entre","preenchido","não preenchido"]'::jsonb),
 ('resolved_at','Data de resolução','date','date',false,false,'["CONTAGEM"]'::jsonb,'["entre","preenchido","não preenchido"]'::jsonb),
 ('closed_at','Data de fechamento','date','date',false,false,'["CONTAGEM"]'::jsonb,'["entre","preenchido","não preenchido"]'::jsonb),
 ('sla_status','SLA','text','status',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('reason_code','Código do motivo','text','category',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('reason_name','Motivo','text','category',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('reason_category','Categoria do motivo','text','category',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('responsible_team','Equipe responsável','text','category',true,false,'["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('linked_document_number','Documento vinculado','text','identifier',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('linked_invoice_number','NF vinculada','text','identifier',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('linked_cte_number','CT-e vinculado','text','identifier',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('linked_delivery_number','Entrega vinculada','text','identifier',true,false,'["CONTAGEM","CONTAGEM_DISTINTA"]'::jsonb,'["igual a","diferente de","preenchido","não preenchido"]'::jsonb),
 ('has_operation_link','Possui vínculo operacional','boolean','flag',true,false,'["CONTAGEM"]'::jsonb,'["igual a","diferente de"]'::jsonb),
 ('has_pending_actions','Possui pendências','boolean','flag',true,false,'["CONTAGEM"]'::jsonb,'["igual a","diferente de"]'::jsonb),
 ('pending_actions_count','Pendências','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('overdue_pending_actions_count','Pendências vencidas','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('treatments_count','Tratativas','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('open_treatments_count','Tratativas abertas','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('financial_entries_total','Total financeiro','number','money',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('documents_count','Documentos','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('attachments_count','Anexos','number','count',false,true,'["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb),
 ('resolution_minutes','Tempo de resolução (minutos)','number','duration',false,true,'["MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb,'[]'::jsonb)
), updated as (
 update public.indicator_field_catalog c set module_key='atendimento',label=f.label,data_type=f.data_type,
 semantic_type=f.semantic_type,allowed_operations=f.allowed_operations,allowed_filters=f.allowed_filters,
 is_dimension=f.is_dimension,is_measure=f.is_measure,is_active=true,updated_at=now()
 from fields f where c.base_table='occurrence_analytics_view' and c.field_key=f.field_key returning c.id
)
insert into public.indicator_field_catalog(tenant_id,module_key,base_table,field_key,label,data_type,semantic_type,allowed_operations,allowed_filters,is_dimension,is_measure)
select null,'atendimento','occurrence_analytics_view',f.field_key,f.label,f.data_type,f.semantic_type,f.allowed_operations,f.allowed_filters,f.is_dimension,f.is_measure
from fields f where not exists(select 1 from public.indicator_field_catalog c where c.tenant_id is null and c.base_table='occurrence_analytics_view' and c.field_key=f.field_key);

with definitions(indicator_key,name,calculation_type,config,sort_order) as (values
 ('occurrences_open_count','Ocorrências abertas','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"current_status","operator":"not_in","value":["closed","canceled","resolved"]}]}'::jsonb,700),
 ('occurrences_overdue_count','Ocorrências vencidas','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"sla_status","operator":"in","value":["overdue","breached"]}]}'::jsonb,701),
 ('occurrences_by_status','Ocorrências por status','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"current_status"}}'::jsonb,702),
 ('occurrences_by_sla_status','Ocorrências por SLA','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"sla_status"}}'::jsonb,703),
 ('occurrences_by_priority','Ocorrências por prioridade','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"current_priority"}}'::jsonb,704),
 ('occurrences_by_reason_category','Ocorrências por categoria de motivo','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"reason_category"}}'::jsonb,705),
 ('occurrences_by_reason','Ocorrências por motivo','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"reason_name"}}'::jsonb,706),
 ('occurrence_avg_resolution_time','Tempo médio de resolução','avg','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"resolution_minutes","aggregation":"avg"},"filter":[{"table":"occurrence_analytics_view","field":"resolution_minutes","operator":"not_null"}]}'::jsonb,707),
 ('occurrences_with_pending_actions','Ocorrências com pendências','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"has_pending_actions","operator":"eq","value":true}]}'::jsonb,708),
 ('occurrence_pending_actions_overdue_count','Pendências vencidas','sum','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"overdue_pending_actions_count","aggregation":"sum"}}'::jsonb,709),
 ('occurrences_without_operation_link','Ocorrências sem vínculo operacional','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"has_operation_link","operator":"eq","value":false}]}'::jsonb,710),
 ('occurrences_by_source_channel','Ocorrências por canal de origem','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"source_channel"}}'::jsonb,711)
), updated as (
 update public.native_indicator_definitions n set module_key='atendimento',family_key='occurrences',name=d.name,
 description='Calculado exclusivamente sobre a projeção segura de ocorrências.',indicator_type=d.calculation_type,
 visualization_type=case when d.calculation_type='group_by' then 'bar' else 'kpi' end,value_format='number',
 calculation_type=d.calculation_type,calculation_config=d.config,required_fields='[]'::jsonb,optional_fields='[]'::jsonb,
 availability_rules='{}'::jsonb,sort_order=d.sort_order,status='active',updated_at=now()
 from definitions d where n.indicator_key=d.indicator_key returning n.id
)
insert into public.native_indicator_definitions(module_key,family_key,indicator_key,name,description,indicator_type,visualization_type,value_format,calculation_type,calculation_config,required_fields,optional_fields,availability_rules,sort_order)
select 'atendimento','occurrences',d.indicator_key,d.name,'Calculado exclusivamente sobre a projeção segura de ocorrências.',d.calculation_type,
 case when d.calculation_type='group_by' then 'bar' else 'kpi' end,'number',d.calculation_type,d.config,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,d.sort_order
from definitions d where not exists(select 1 from public.native_indicator_definitions n where n.indicator_key=d.indicator_key);
