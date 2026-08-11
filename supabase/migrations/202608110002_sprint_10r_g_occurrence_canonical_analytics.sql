-- Sprint 10R-G: occurrences as an applied canonical and analytical entity.
-- The projection is a security-invoker view: callers remain constrained by the
-- RLS policies of every transactional table used below.
create or replace view public.occurrence_analytics_view
with (security_invoker = true) as
select o.tenant_id, o.id as occurrence_id, o.occurrence_number,
 o.current_status, o.current_priority, o.source_channel, o.opened_at, o.due_at,
 o.resolved_at, o.closed_at, o.sla_status,
 r.code as reason_code, r.name as reason_name, rc.name as reason_category,
 tr.responsible_team, ol.operation_record_id as primary_operation_record_id,
 op.document_number as linked_document_number, op.invoice_number as linked_invoice_number,
 op.cte_number as linked_cte_number, op.delivery_number as linked_delivery_number,
 (coalesce(links.total,0)>0) as has_operation_link,
 (coalesce(pa.total,0)>0) as has_pending_actions, coalesce(pa.total,0)::integer as pending_actions_count,
 coalesce(pa.overdue,0)::integer as overdue_pending_actions_count,
 coalesce(treat.total,0)::integer as treatments_count, coalesce(treat.open,0)::integer as open_treatments_count,
 coalesce(fin.total,0)::numeric as financial_entries_total,
 coalesce(doc.total,0)::integer as documents_count, coalesce(att.total,0)::integer as attachments_count,
 case when coalesce(o.resolved_at,o.closed_at) is not null
   then extract(epoch from (coalesce(o.resolved_at,o.closed_at)-o.opened_at))/60 end as resolution_minutes
from public.occurrences o
left join public.occurrence_events first_event on first_event.id=(select e.id from public.occurrence_events e where e.tenant_id=o.tenant_id and e.occurrence_id=o.id and e.reason_id is not null order by e.event_at,e.created_at limit 1)
left join public.occurrence_reasons r on r.tenant_id=o.tenant_id and r.id=first_event.reason_id
left join public.occurrence_reason_categories rc on rc.tenant_id=o.tenant_id and rc.id=r.category_id
left join public.occurrence_operation_links ol on ol.tenant_id=o.tenant_id and ol.occurrence_id=o.id and ol.is_primary
left join public.operation_records op on op.tenant_id=o.tenant_id and op.id=ol.operation_record_id
left join lateral (select count(*) total from public.occurrence_operation_links x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id) links on true
left join lateral (select count(*) total, count(*) filter(where status not in ('done','canceled') and due_at<now()) overdue from public.occurrence_pending_actions x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null) pa on true
left join lateral (select count(*) total, count(*) filter(where status not in ('done','canceled')) open, (array_agg(responsible_team order by created_at desc) filter(where responsible_team is not null))[1] responsible_team from public.occurrence_treatments x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null) tr on true
left join lateral (select count(*) total, count(*) filter(where status not in ('done','canceled')) open from public.occurrence_treatments x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null) treat on true
left join lateral (select coalesce(sum(amount),0) total from public.occurrence_financial_entries x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null and status not in ('rejected','canceled')) fin on true
left join lateral (select count(*) total from public.occurrence_documents x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null) doc on true
left join lateral (select count(*) total from public.occurrence_attachments x where x.tenant_id=o.tenant_id and x.occurrence_id=o.id and x.deleted_at is null) att on true
where o.deleted_at is null;

with entity_seed as (select t.id tenant_id from public.tenants t)
insert into public.canonical_entities(tenant_id,module_key,entity_key,name,description,status,is_system,sort_order)
select tenant_id,'atendimento','occurrences','Ocorrências','Agregado transacional nativo e projeção analítica segura.','active',true,40 from entity_seed
on conflict(tenant_id,entity_key) do update set name=excluded.name,module_key=excluded.module_key,status='active',is_system=true;

with f(field_key,name,data_type,sort_order) as (values
 ('occurrence_number','Número da ocorrência','text',400),('title','Título','text',401),('description','Descrição','text',402),('current_status','Status','enum',403),('current_priority','Prioridade','enum',404),('source_channel','Canal de origem','enum',405),('opened_at','Data de abertura','datetime',406),('due_at','Prazo','datetime',407),('resolved_at','Data de resolução','datetime',408),('closed_at','Data de fechamento','datetime',409),('sla_status','SLA','enum',410),('resolution_summary','Resumo da resolução','text',411),('closed_reason','Motivo do fechamento','text',412),('closed_notes','Notas do fechamento','text',413),('reason_code','Código do motivo','text',414),('reason_name','Motivo','text',415),('reason_category','Categoria do motivo','text',416),('responsible_team','Equipe responsável','text',417),('linked_document_number','Documento vinculado','text',418),('linked_invoice_number','NF vinculada','text',419),('linked_cte_number','CTe vinculado','text',420),('linked_delivery_number','Entrega vinculada','text',421),('has_operation_link','Possui vínculo operacional','boolean',422),('has_pending_actions','Possui pendências','boolean',423),('pending_actions_count','Quantidade de pendências','integer',424),('treatments_count','Quantidade de tratativas','integer',425),('financial_entries_total','Total financeiro','decimal',426),('documents_count','Quantidade de documentos','integer',427),('attachments_count','Quantidade de anexos','integer',428))
insert into public.canonical_fields(tenant_id,canonical_entity_id,field_key,name,data_type,is_required,is_system,sort_order)
select e.tenant_id,e.id,f.field_key,f.name,f.data_type,false,true,f.sort_order from f join public.canonical_entities e on e.entity_key='occurrences'
on conflict(canonical_entity_id,field_key) do update set name=excluded.name,data_type=excluded.data_type,is_system=true;

with f(field_key,label,data_type,semantic_type,is_dimension,is_measure,filters) as (values
 ('current_status','Status','text','status',true,false,true),('current_priority','Prioridade','text','status',true,false,true),('sla_status','SLA','text','status',true,false,true),('source_channel','Canal de origem','text','channel',true,false,true),('reason_code','Código do motivo','text','category',true,false,true),('reason_name','Motivo','text','category',true,false,false),('reason_category','Categoria do motivo','text','category',true,false,true),('responsible_team','Equipe responsável','text','category',true,false,true),('has_operation_link','Possui vínculo operacional','boolean','flag',true,false,true),('has_pending_actions','Possui pendências','boolean','flag',true,false,true),('opened_at','Data de abertura','date','date',false,false,true),('due_at','Prazo','date','date',false,false,true),('closed_at','Data de fechamento','date','date',false,false,true),('count','Ocorrências','number','count',false,true,false),('resolution_minutes','Tempo de resolução (minutos)','number','duration',false,true,false),('pending_actions_count','Pendências','number','count',false,true,false),('overdue_pending_actions_count','Pendências vencidas','number','count',false,true,false),('treatments_count','Tratativas','number','count',false,true,false),('open_treatments_count','Tratativas abertas','number','count',false,true,false),('financial_entries_total','Total financeiro','number','money',false,true,false),('documents_count','Documentos','number','count',false,true,false),('attachments_count','Anexos','number','count',false,true,false))
insert into public.indicator_field_catalog(tenant_id,module_key,base_table,field_key,label,data_type,semantic_type,allowed_operations,allowed_filters,is_dimension,is_measure)
select null,'atendimento','occurrence_analytics_view',field_key,label,data_type,semantic_type,
 case when is_measure then '["SOMA","MÉDIA","MÍNIMO","MÁXIMO","CONTAGEM"]'::jsonb else '["CONTAGEM","CONTAGEM_DISTINTA","DISTRIBUIÇÃO_POR_CATEGORIA"]'::jsonb end,
 case when filters then '["igual a","diferente de","preenchido","não preenchido","entre"]'::jsonb else '[]'::jsonb end,is_dimension,is_measure from f on conflict do nothing;

with d(indicator_key,name,calculation_type,config,required,sort_order) as (values
 ('occurrences_open_count','Ocorrências abertas','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"current_status","operator":"not_in","value":["closed","canceled","resolved"]}]}'::jsonb,'[{"key":"status","label":"Status","any_of":[{"table":"occurrence_analytics_view","field":"current_status"}]}]'::jsonb,700),
 ('occurrences_overdue_count','Ocorrências vencidas','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"sla_status","operator":"in","value":["overdue","breached"]}]}'::jsonb,'[{"key":"sla","label":"SLA","any_of":[{"table":"occurrence_analytics_view","field":"sla_status"}]}]'::jsonb,701),
 ('occurrences_by_sla_status','Ocorrências por SLA','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"sla_status"}}'::jsonb,'[]'::jsonb,702),
 ('occurrences_by_status','Ocorrências por status','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"current_status"}}'::jsonb,'[]'::jsonb,703),
 ('occurrences_by_reason_category','Ocorrências por categoria do motivo','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"reason_category"}}'::jsonb,'[]'::jsonb,704),
 ('occurrences_by_priority','Ocorrências por prioridade','group_by','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"dimension":{"table":"occurrence_analytics_view","field":"current_priority"}}'::jsonb,'[]'::jsonb,705),
 ('occurrences_without_operation_link','Ocorrências sem vínculo operacional','count','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"occurrence_id","aggregation":"count"},"filter":[{"table":"occurrence_analytics_view","field":"has_operation_link","operator":"eq","value":false}]}'::jsonb,'[]'::jsonb,706),
 ('occurrence_avg_resolution_time','Tempo médio de resolução','avg','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"resolution_minutes","aggregation":"avg"}}'::jsonb,'[]'::jsonb,707),
 ('occurrence_pending_actions_overdue_count','Pendências vencidas de ocorrências','sum','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"overdue_pending_actions_count","aggregation":"sum"}}'::jsonb,'[]'::jsonb,708),
 ('occurrence_financial_entries_total','Total financeiro de ocorrências','sum','{"table":"occurrence_analytics_view","metric":{"table":"occurrence_analytics_view","field":"financial_entries_total","aggregation":"sum"}}'::jsonb,'[]'::jsonb,709))
insert into public.native_indicator_definitions(module_key,family_key,indicator_key,name,description,indicator_type,visualization_type,value_format,calculation_type,calculation_config,required_fields,optional_fields,availability_rules,sort_order)
select 'atendimento','occurrences',indicator_key,name,'Calculado exclusivamente sobre a projeção segura de ocorrências.',calculation_type,case when calculation_type='group_by' then 'bar' else 'kpi' end,case when indicator_key like '%financial%' then 'currency' else 'number' end,calculation_type,config,required,'[]'::jsonb,'{}'::jsonb,sort_order from d on conflict(indicator_key) do update set calculation_config=excluded.calculation_config,required_fields=excluded.required_fields;

with p(key,name,resource,action) as (values
 ('occurrences.canonical.view','Visualizar campos canônicos de ocorrência','occurrences_canonical','view'),('occurrences.mapping.manage','Parear campos de ocorrência','occurrences_mapping','manage'),('occurrences.normalize','Normalizar ocorrências','occurrences','normalize'),('occurrences.indicators.view','Visualizar indicadores de ocorrência','occurrence_indicators','view'),('occurrences.analytics.use','Usar ocorrência em relatórios e dashboards','occurrence_analytics','use'),('occurrences.ai.create_draft','Criar rascunho de ocorrência por IA','occurrences','ai_create_draft'),('occurrences.ai.create_confirmed','Criar ocorrência confirmada por IA','occurrences','ai_create_confirmed'),('occurrences.ai.add_treatment','Adicionar tratativa por IA','occurrence_treatments','ai_create'),('occurrences.legacy.push','Registrar solicitação de envio ao legado','occurrences_legacy','push'))
insert into public.permissions(key,name,module_key,resource,action,description) select key,name,'atendimento',resource,action,name||'.' from p on conflict(key) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key in ('occurrences.canonical.view','occurrences.mapping.manage','occurrences.normalize','occurrences.indicators.view','occurrences.analytics.use','occurrences.ai.create_draft','occurrences.ai.create_confirmed','occurrences.ai.add_treatment','occurrences.legacy.push') on conflict do nothing;
