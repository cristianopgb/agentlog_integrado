alter table public.ai_agents
  add column if not exists response_style jsonb not null default '{}'::jsonb,
  add column if not exists language text not null default 'pt-BR',
  add column if not exists source_citation_policy text,
  add column if not exists fallback_policy text,
  add column if not exists clarification_policy text;

alter table public.ai_agents drop constraint if exists ai_agents_agent_type_check;
alter table public.ai_agents add constraint ai_agents_agent_type_check check (agent_type in ('dashboard_analyst','report_writer','general_chat','attendance_inbox','financial','transport','warehouse','teams','saas_admin','setup_dev'));
