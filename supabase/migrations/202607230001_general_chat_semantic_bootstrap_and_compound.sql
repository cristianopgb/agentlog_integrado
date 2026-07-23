-- Controlled compound capability and useful semantic bootstrap for active General Chat agents.
insert into public.ai_tools(tool_key,name,description,module_key,is_active) values ('logistics.compound.query','Consulta logística composta','Combina somente métricas, distribuição e amostra canônicas permitidas.','core',true) on conflict(tool_key) do update set name=excluded.name,description=excluded.description,is_active=true,updated_at=now();
insert into public.ai_agent_tools(tenant_id,agent_id,tool_id,is_enabled,config)
select a.tenant_id,a.id,t.id,true,'{}'::jsonb from public.ai_agents a join public.ai_tools t on t.tool_key in ('logistics.compound.query','logistics.metric.get','logistics.distribution.get','logistics.records.search') where a.agent_type='general_chat' and a.status='active' and a.deleted_at is null on conflict(tenant_id,agent_id,tool_id) do update set is_enabled=true,updated_at=now();
create unique index if not exists agent_response_cache_identity on public.agent_response_cache(tenant_id,agent_id,question_hash,tool_plan_hash,tool_result_hash,canonical_data_version,agent_config_hash);
insert into public.agent_semantic_items(tenant_id,agent_id,item_type,item_key,title,description,synonyms,tool_key,tool_args_template,metadata)
select a.tenant_id,a.id,x.item_type,x.item_key,x.title,x.description,x.synonyms,x.tool_key,x.args,x.metadata
from public.ai_agents a cross join (values
('tool','logistics.metric.get','Métricas logísticas','Totais e médias homologados.',array['frete','custo','peso','volume']::text[],'logistics.metric.get','{}'::jsonb,'{}'::jsonb),
('metric','frete_total','Frete total','Custo total de frete.',array['custo total de frete','total de transporte']::text[],'logistics.metric.get','{"metric":"frete_total"}'::jsonb,'{}'::jsonb),
('metric','frete_medio','Frete médio','Média de frete informado.',array['media de frete']::text[],'logistics.metric.get','{"metric":"frete_medio"}'::jsonb,'{}'::jsonb),
('dimension','status','Entregas por status','Distribuição de entregas por status.',array['status das entregas']::text[],'logistics.distribution.get','{"metric":"total_entregas","dimension":"status"}'::jsonb,'{}'::jsonb),
('example','frete_total','Qual o custo total de frete','Exemplo aprovado.',array[]::text[],'logistics.metric.get','{"metric":"frete_total"}'::jsonb,'{"approved":true}'::jsonb),
('example','frete_medio','Qual o frete médio','Exemplo aprovado.',array[]::text[],'logistics.metric.get','{"metric":"frete_medio"}'::jsonb,'{"approved":true}'::jsonb),
('example','entregas_status','Entregas por status','Exemplo aprovado.',array[]::text[],'logistics.distribution.get','{"metric":"total_entregas","dimension":"status"}'::jsonb,'{"approved":true}'::jsonb),
('example','motorista_analise','Analise motorista','Exemplo aprovado.',array[]::text[],'logistics.entity.analysis','{}'::jsonb,'{"approved":true}'::jsonb),
('example','placa_frete_status','Placa ABC1D23 frete e status','Exemplo aprovado.',array['veiculo frete status']::text[],'logistics.compound.query','{"requested_outputs":["freight_total","status_distribution","sample_records"]}'::jsonb,'{"approved":true}'::jsonb)
) as x(item_type,item_key,title,description,synonyms,tool_key,args,metadata)
where a.agent_type='general_chat' and a.status='active' and a.deleted_at is null and not exists (select 1 from public.agent_semantic_items s where s.tenant_id=a.tenant_id and s.agent_id=a.id and s.item_type=x.item_type and s.item_key=x.item_key);
