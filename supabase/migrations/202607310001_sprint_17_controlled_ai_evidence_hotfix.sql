-- Sprint 17 hotfix: expose the existing canonical evidence capabilities through
-- the single controlled tool registry. No raw or staging access is introduced.
insert into public.ai_tools (tool_key, name, description, module_key, is_active) values
  ('treated_data.summary.get', 'Resumo operacional tratado', 'Resumo seguro da base canônica vigente.', 'core', true),
  ('treated_data.aggregate_records', 'Agregar dados tratados', 'Agrega somente métricas e dimensões permitidas da base canônica.', 'core', true),
  ('treated_data.search_records', 'Buscar registros tratados', 'Busca limitada de registros canônicos vigentes.', 'core', true),
  ('treated_data.get_record_detail', 'Detalhar registro tratado', 'Detalhe seguro de um registro canônico vigente.', 'core', true),
  ('reports.get_job_snapshot', 'Snapshot de relatório gerado', 'Consulta o snapshot determinístico de um job concluído.', 'core', true),
  ('dashboard.get_snapshot', 'Snapshot de dashboard publicado', 'Consulta widgets e resultados de uma versão publicada.', 'core', true)
on conflict (tool_key) do update set description=excluded.description, is_active=true, updated_at=now();

insert into public.ai_agent_tools (tenant_id, agent_id, tool_id, is_enabled, config)
select a.tenant_id, a.id, t.id, true, '{}'::jsonb
from public.ai_agents a
join public.ai_tools t on t.tool_key in (
  'treated_data.summary.get','treated_data.aggregate_records','treated_data.search_records',
  'treated_data.get_record_detail','reports.get_job_snapshot','dashboard.get_snapshot',
  'indicators.list_available','indicators.get_result'
)
where a.status = 'active' and a.deleted_at is null
  and a.agent_type in ('general_chat', 'dashboard_analyst', 'report_writer', 'transport', 'financial', 'warehouse')
on conflict (tenant_id, agent_id, tool_id) do update set is_enabled=true, updated_at=now();
