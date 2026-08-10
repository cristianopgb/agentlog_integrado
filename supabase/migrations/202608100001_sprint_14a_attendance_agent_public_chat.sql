-- Sprint 14-A: public operational attendance, controlled actions and audit trail.
alter table public.inbox_conversations drop constraint if exists inbox_conversations_channel_check;
alter table public.inbox_conversations add constraint inbox_conversations_channel_check check (channel in ('manual','api','whatsapp','email','system','public_chat'));

create table public.public_chat_sessions (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null, contact_id uuid not null, session_token_hash text not null,
  contact_name text, contact_phone text not null, status text not null default 'open' check(status in ('open','closed','expired')),
  last_seen_at timestamptz, created_at timestamptz not null default now(), closed_at timestamptz, metadata jsonb not null default '{}'::jsonb,
  foreign key(tenant_id,conversation_id) references public.inbox_conversations(tenant_id,id),
  foreign key(tenant_id,contact_id) references public.contacts(tenant_id,id)
);
create index public_chat_sessions_conversation_idx on public.public_chat_sessions(tenant_id,conversation_id);
create index public_chat_sessions_phone_idx on public.public_chat_sessions(tenant_id,contact_phone);
create unique index public_chat_sessions_token_hash_idx on public.public_chat_sessions(session_token_hash);
alter table public.public_chat_sessions enable row level security;

create table public.integration_action_capabilities (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, data_source_id uuid,
 module_key text not null default 'atendimento', capability_key text not null, direction text not null default 'write' check(direction in ('read','write','both')),
 is_active boolean not null default false, requires_human_approval boolean not null default true,
 endpoint_method text check(endpoint_method is null or endpoint_method in ('GET','POST','PUT','PATCH')), endpoint_path text,
 request_contract jsonb not null default '{}'::jsonb, response_contract jsonb not null default '{}'::jsonb, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index integration_action_capabilities_lookup_idx on public.integration_action_capabilities(tenant_id,capability_key,is_active);
alter table public.integration_action_capabilities enable row level security;

create table public.occurrence_legacy_sync_logs (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade, occurrence_id uuid not null,
 capability_id uuid references public.integration_action_capabilities(id), direction text not null default 'outbound', status text not null check(status in ('not_configured','skipped','pending_configuration','pending_send','sent','failed')),
 action text not null, request_payload jsonb not null default '{}'::jsonb, response_payload jsonb not null default '{}'::jsonb,
 error_code text, error_message text, external_reference text, attempts integer not null default 0, next_retry_at timestamptz, created_at timestamptz not null default now(),
 foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id)
);
alter table public.occurrence_legacy_sync_logs enable row level security;

insert into public.ai_tools(tool_key,name,description,module_key,is_active) values
('attendance.contacts.find_by_phone','Localizar contato por telefone','Localiza contato do tenant sem expor metadados.','atendimento',true),
('attendance.inbox.get_context','Contexto público do Inbox','Consulta mensagens públicas, contato e ocorrência vinculada.','atendimento',true),
('attendance.operation.find_by_document','Localizar operação por documento','Consulta somente registros operacionais tratados.','atendimento',true),
('attendance.operation.verify_driver_document','Validar motorista da operação','Confere telefone e nome contra a operação tratada.','atendimento',true),
('attendance.knowledge.search','Consultar base de conhecimento','Busca orientação publicada do tenant.','atendimento',true),
('attendance.occurrence.create','Criar ocorrência pelo atendimento','Cria ocorrência local validada e vincula ao Inbox.','atendimento',true),
('attendance.occurrence.add_treatment','Adicionar tratativa','Registra tratativa sem finalizar ocorrência.','atendimento',true),
('attendance.legacy.check_capability','Verificar capability do legado','Verifica capacidade declarada de integração.','atendimento',true),
('attendance.legacy.create_if_configured','Registrar envio controlado ao legado','Registra ação; nunca executa POST livre.','atendimento',true)
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,module_key=excluded.module_key,is_active=true,updated_at=now();

with p(key,name,resource,action,description) as (values
('agents.attendance.run','Executar agente de atendimento','agents','run','Executa atendimento controlado.'),
('agents.attendance.configure','Configurar agente de atendimento','agents','configure','Configura atendimento e tools.'),
('occurrences.ai.create_confirmed','Criar ocorrência confirmada por IA','occurrences','ai_create_confirmed','Criação controlada confirmada.'),
('occurrences.ai.create_draft','Criar rascunho de ocorrência por IA','occurrences','ai_create_draft','Criação controlada em rascunho.'),
('occurrences.ai.suggest_reply','Sugerir resposta de ocorrência','occurrences','ai_suggest_reply','Sugestão controlada de resposta.'),
('occurrences.legacy.push','Enviar ocorrência ao legado','occurrences','legacy_push','Autoriza envio controlado.'),
('occurrences.legacy.view_logs','Visualizar logs do legado','occurrences','legacy_view_logs','Consulta logs de sincronização.'))
insert into public.permissions(key,name,module_key,resource,action,description) select key,name,'atendimento',resource,action,description from p on conflict(key) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key in ('agents.attendance.run','agents.attendance.configure','occurrences.ai.create_confirmed','occurrences.ai.create_draft','occurrences.ai.suggest_reply','occurrences.legacy.push','occurrences.legacy.view_logs') on conflict do nothing;
create policy "legacy sync logs view" on public.occurrence_legacy_sync_logs for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.legacy.view_logs'));
-- No public/authenticated policies exist for sessions or capability writes. Service role owns intake and writes.
