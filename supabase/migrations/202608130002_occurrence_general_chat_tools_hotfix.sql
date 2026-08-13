-- Habilita as tools de leitura de ocorrências apenas para Chat Geral ativo em tenants com Atendimento ativo.
update public.ai_agent_tools aat
set is_enabled = true,
    updated_at = now()
from public.ai_agents a,
     public.ai_tools t
where aat.tenant_id = a.tenant_id
  and aat.agent_id = a.id
  and aat.tool_id = t.id
  and a.agent_type = 'general_chat'
  and a.status = 'active'
  and a.deleted_at is null
  and t.tool_key in ('occurrences.analytics.list', 'occurrences.analytics.detail')
  and t.is_active = true
  and exists (
    select 1
    from public.tenant_modules tm
    join public.modules m on m.id = tm.module_id
    where tm.tenant_id = a.tenant_id
      and tm.is_active = true
      and m.key = 'atendimento'
  );

insert into public.ai_agent_tools (tenant_id, agent_id, tool_id, is_enabled)
select a.tenant_id, a.id, t.id, true
from public.ai_agents a
cross join public.ai_tools t
where a.agent_type = 'general_chat'
  and a.status = 'active'
  and a.deleted_at is null
  and t.tool_key in ('occurrences.analytics.list', 'occurrences.analytics.detail')
  and t.is_active = true
  and exists (
    select 1
    from public.tenant_modules tm
    join public.modules m on m.id = tm.module_id
    where tm.tenant_id = a.tenant_id
      and tm.is_active = true
      and m.key = 'atendimento'
  )
  and not exists (
    select 1
    from public.ai_agent_tools aat
    where aat.tenant_id = a.tenant_id
      and aat.agent_id = a.id
      and aat.tool_id = t.id
  );
