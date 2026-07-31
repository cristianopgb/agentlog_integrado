-- Sprint 17 hotfix follow-up.
-- Canonical tools are linked to the remaining active agent types. The executor
-- still requires this per-agent link and every request remains tenant-scoped.
insert into public.ai_agent_tools (tenant_id, agent_id, tool_id, is_enabled, config)
select a.tenant_id, a.id, t.id, true, '{}'::jsonb
from public.ai_agents a
join public.ai_tools t on t.tool_key in (
  'treated_data.summary.get','treated_data.aggregate_records','treated_data.search_records',
  'treated_data.get_record_detail','reports.get_job_snapshot','dashboard.get_snapshot',
  'indicators.list_available','indicators.get_result'
)
where a.status = 'active' and a.deleted_at is null
  and a.agent_type in ('attendance_inbox', 'teams', 'saas_admin', 'setup_dev')
on conflict (tenant_id, agent_id, tool_id) do update
set is_enabled=true, updated_at=now();
