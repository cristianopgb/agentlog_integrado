-- Chat Geral: somente capacidades controladas para o loop de tool calling da IA.
insert into public.ai_tools (tool_key,name,description,module_key,is_active) values
 ('analytics.map.get','Mapa analítico','Lista compacta de resultados configurados do tenant.','core',true),
 ('analytics.result.get','Resultado analítico','Obtém um resultado configurado e limitado.','core',true),
 ('analytics.context.analyze','Contexto analítico','Obtém fatos compactos para uma análise configurada.','core',true),
 ('operational.record.find','Registro operacional','Consulta pontual de registro canônico vigente.','core',true),
 ('knowledge.guidance.search','Orientação funcional','Consulta o manual funcional publicado.','core',true)
on conflict (tool_key) do update set name=excluded.name,description=excluded.description,is_active=true,updated_at=now();

insert into public.ai_agent_tools (tenant_id,agent_id,tool_id,is_enabled,config)
select a.tenant_id,a.id,t.id,true,'{}'::jsonb
from public.ai_agents a join public.ai_tools t on t.tool_key in
 ('analytics.map.get','analytics.result.get','analytics.context.analyze','operational.record.find','knowledge.guidance.search')
where a.agent_type='general_chat' and a.status='active' and a.deleted_at is null
on conflict (tenant_id,agent_id,tool_id) do update set is_enabled=true,updated_at=now();
