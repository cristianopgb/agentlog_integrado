-- Sprint 14-B hotfix: make the controlled reason catalog available to active attendance agents.
update public.ai_tools
set name='Listar motivos de ocorrência', description='Lista somente motivos ativos e seguros do tenant.',
    module_key='atendimento', is_active=true, updated_at=now()
where tool_key='attendance.occurrence.reasons.list';

insert into public.ai_tools(tool_key,name,description,module_key,is_active)
select 'attendance.occurrence.reasons.list','Listar motivos de ocorrência','Lista somente motivos ativos e seguros do tenant.','atendimento',true
where not exists (select 1 from public.ai_tools where tool_key='attendance.occurrence.reasons.list');

update public.ai_agent_tools link
set is_enabled=true, updated_at=now()
from public.ai_agents agent, public.ai_tools tool
where link.tenant_id=agent.tenant_id and link.agent_id=agent.id and link.tool_id=tool.id
  and agent.agent_type='attendance_inbox' and agent.status='active' and agent.deleted_at is null
  and tool.tool_key='attendance.occurrence.reasons.list' and tool.is_active=true
  and exists (
    select 1 from public.tenant_modules tenant_module
    join public.modules module on module.id=tenant_module.module_id
    where tenant_module.tenant_id=agent.tenant_id and tenant_module.is_active=true and module.key='atendimento'
  );

insert into public.ai_agent_tools(tenant_id,agent_id,tool_id,is_enabled)
select agent.tenant_id,agent.id,tool.id,true
from public.ai_agents agent cross join public.ai_tools tool
where agent.agent_type='attendance_inbox' and agent.status='active' and agent.deleted_at is null
  and tool.tool_key='attendance.occurrence.reasons.list' and tool.is_active=true
  and exists (
    select 1 from public.tenant_modules tenant_module
    join public.modules module on module.id=tenant_module.module_id
    where tenant_module.tenant_id=agent.tenant_id and tenant_module.is_active=true and module.key='atendimento'
  )
  and not exists (
    select 1 from public.ai_agent_tools link
    where link.tenant_id=agent.tenant_id and link.agent_id=agent.id and link.tool_id=tool.id
  );
