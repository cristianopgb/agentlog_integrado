-- Hotfix 14-C-R1: grounding por número funcional e auditoria segura da tratativa.
alter table public.occurrence_treatments
  add column if not exists source_channel text,
  add column if not exists conversation_id uuid references public.inbox_conversations(id) on delete set null,
  add column if not exists original_message text,
  add column if not exists classification text,
  add column if not exists requires_human_review boolean not null default false;

update public.ai_tools
set module_key = 'atendimento', is_active = true, updated_at = now()
where tool_key in (
  'attendance.inbox.get_context',
  'attendance.occurrence.get_detail',
  'attendance.occurrence.add_treatment',
  'attendance.knowledge.search',
  'attendance.occurrence.create'
);

insert into public.ai_tools (tool_key, name, description, module_key, is_active)
select seed.tool_key, seed.name, seed.description, 'atendimento', true
from (values
  ('attendance.inbox.get_context','Contexto público do Inbox','Consulta contexto seguro da conversa e ocorrência vinculada.'),
  ('attendance.occurrence.get_detail','Consultar ocorrência','Consulta ocorrência por UUID, número funcional ou conversa.'),
  ('attendance.occurrence.add_treatment','Adicionar tratativa','Registra atualização sem finalizar ocorrência.'),
  ('attendance.knowledge.search','Consultar base de conhecimento','Busca somente procedimentos publicados do tenant.'),
  ('attendance.occurrence.create','Criar ocorrência pelo atendimento','Cria ocorrência validada quando não houver vínculo existente.')
) as seed(tool_key,name,description)
where not exists (select 1 from public.ai_tools tool where tool.tool_key = seed.tool_key);

update public.ai_agent_tools link
set is_enabled = true, updated_at = now()
from public.ai_agents agent, public.ai_tools tool
where link.tenant_id = agent.tenant_id and link.agent_id = agent.id and link.tool_id = tool.id
  and agent.agent_type = 'attendance_inbox' and agent.status = 'active' and agent.deleted_at is null
  and tool.tool_key in ('attendance.inbox.get_context','attendance.occurrence.get_detail','attendance.occurrence.add_treatment','attendance.knowledge.search','attendance.occurrence.create')
  and tool.is_active = true
  and exists (
    select 1 from public.tenant_modules tenant_module
    join public.modules module on module.id = tenant_module.module_id
    where tenant_module.tenant_id = agent.tenant_id and tenant_module.is_active = true and module.key = 'atendimento'
  );

insert into public.ai_agent_tools (tenant_id, agent_id, tool_id, is_enabled)
select agent.tenant_id, agent.id, tool.id, true
from public.ai_agents agent cross join public.ai_tools tool
where agent.agent_type = 'attendance_inbox' and agent.status = 'active' and agent.deleted_at is null
  and tool.tool_key in ('attendance.inbox.get_context','attendance.occurrence.get_detail','attendance.occurrence.add_treatment','attendance.knowledge.search','attendance.occurrence.create')
  and tool.is_active = true
  and exists (
    select 1 from public.tenant_modules tenant_module
    join public.modules module on module.id = tenant_module.module_id
    where tenant_module.tenant_id = agent.tenant_id and tenant_module.is_active = true and module.key = 'atendimento'
  )
  and not exists (
    select 1 from public.ai_agent_tools link
    where link.tenant_id = agent.tenant_id and link.agent_id = agent.id and link.tool_id = tool.id
  );
