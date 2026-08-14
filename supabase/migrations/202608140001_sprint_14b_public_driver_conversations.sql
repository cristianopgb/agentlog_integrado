-- Sprint 14-B: visitor-scoped public conversation history and operational identity.
alter table public.public_chat_sessions alter column contact_id drop not null;
alter table public.public_chat_sessions alter column contact_phone drop not null;
alter table public.public_chat_sessions add column if not exists visitor_token_hash text;
alter table public.inbox_conversations add column if not exists public_phone_normalized text;

update public.public_chat_sessions set visitor_token_hash=session_token_hash where visitor_token_hash is null;
alter table public.public_chat_sessions alter column visitor_token_hash set not null;

create index if not exists public_chat_sessions_visitor_idx
  on public.public_chat_sessions(tenant_id,visitor_token_hash,created_at desc);
create index if not exists inbox_conversations_contact_public_idx
  on public.inbox_conversations(tenant_id,contact_id,updated_at desc)
  where channel='public_chat' and deleted_at is null;
create index if not exists inbox_conversations_phone_public_idx
  on public.inbox_conversations(tenant_id,public_phone_normalized,updated_at desc)
  where channel='public_chat' and deleted_at is null;

update public.ai_tools
set name='Listar motivos de ocorrência', description='Lista somente motivos ativos e seguros do tenant.',
    module_key='atendimento', is_active=true, updated_at=now()
where tool_key='attendance.occurrence.reasons.list';

insert into public.ai_tools(tool_key,name,description,module_key,is_active)
select 'attendance.occurrence.reasons.list','Listar motivos de ocorrência','Lista somente motivos ativos e seguros do tenant.','atendimento',true
where not exists (select 1 from public.ai_tools where tool_key='attendance.occurrence.reasons.list');
