-- Controlled orchestration tools for General Chat; these do not grant raw database access.
insert into public.ai_tools(tool_key,name,description,module_key,is_active) values
('logistics.metric.get','Consultar métrica logística','Consulta métrica homologada ou agregação canônica controlada.','core',true),
('logistics.distribution.get','Consultar distribuição logística','Agrupa dados canônicos por dimensão permitida.','core',true),
('logistics.records.search','Pesquisar registros logísticos','Pesquisa registros canônicos com filtros controlados.','core',true),
('logistics.entity.analysis','Analisar entidade logística','Consolida análise de entidade com amostra limitada.','core',true),
('logistics.operation.analysis','Analisar operação logística','Consolida visão geral da operação.','core',true),
('dashboard.summary.get','Obter resumo de dashboard','Retorna apenas resumo compacto publicado.','core',true),
('report.summary.get','Obter resumo de relatório','Retorna apenas resumo compacto publicado.','core',true)
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,module_key=excluded.module_key,is_active=true,updated_at=now();
update public.ai_tools set is_active=false,updated_at=now() where tool_key in ('dashboard.get_snapshot','dashboard.get_widget_results','reports.get_job_snapshot');
-- Existing General Chat agents receive only the new controlled tools.
insert into public.ai_agent_tools(tenant_id,agent_id,tool_id,is_enabled,config)
select a.tenant_id,a.id,t.id,true,'{}'::jsonb
from public.ai_agents a join public.ai_tools t on t.tool_key in ('logistics.metric.get','logistics.distribution.get','logistics.records.search','logistics.entity.analysis','logistics.operation.analysis','dashboard.summary.get','report.summary.get','knowledge_base.search')
where a.agent_type='general_chat' and a.status='active' and a.deleted_at is null
on conflict(tenant_id,agent_id,tool_id) do update set is_enabled=true,updated_at=now();
