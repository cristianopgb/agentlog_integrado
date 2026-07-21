-- Sprint 17D: tenant-scoped controlled general chat and knowledge base.
create table public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null, user_id uuid references auth.users(id), title text,
  status text not null default 'active' check (status in ('active','archived')),
  context_scope text not null default 'general' check (context_scope in ('general')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  ai_run_id uuid references public.ai_runs(id) on delete set null, role text not null check (role in ('user','assistant','system','tool')),
  content text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index ai_chat_conversations_tenant_user_updated_idx on public.ai_chat_conversations(tenant_id,user_id,updated_at desc);
create index ai_chat_messages_tenant_conversation_created_idx on public.ai_chat_messages(tenant_id,conversation_id,created_at);

create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null, description text, scope text not null default 'tenant' check (scope in ('system','tenant')),
  document_type text not null check (document_type in ('manual','faq','process','policy','rule','other')),
  module_key text, status text not null default 'draft' check (status in ('draft','published','archived')),
  storage_path text, source_filename text, mime_type text, content_hash text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(tenant_id,content_hash)
);
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade, chunk_index integer not null,
  title text, content text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique(document_id,chunk_index)
);
create index knowledge_documents_tenant_status_idx on public.knowledge_documents(tenant_id,status,updated_at desc);
create index knowledge_chunks_tenant_document_idx on public.knowledge_chunks(tenant_id,document_id,chunk_index);

alter table public.ai_chat_conversations enable row level security; alter table public.ai_chat_messages enable row level security;
alter table public.knowledge_documents enable row level security; alter table public.knowledge_chunks enable row level security;
create policy "tenant members ai chat conversations" on public.ai_chat_conversations for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
create policy "tenant members ai chat messages" on public.ai_chat_messages for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
create policy "tenant members knowledge documents" on public.knowledge_documents for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
create policy "tenant members knowledge chunks" on public.knowledge_chunks for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));

insert into public.ai_tools(tool_key,name,description,module_key) values
 ('knowledge_base.search','Pesquisar base de conhecimento','Pesquisa trechos publicados do manual e processos do tenant.','core'),
 ('treated_data.search_records','Buscar registros tratados','Busca identificadores em registros canônicos permitidos.','core'),
 ('treated_data.get_record_detail','Detalhar registro tratado','Retorna campos e eventos permitidos de um registro canônico.','core'),
 ('treated_data.aggregate_records','Agregar registros tratados','Calcula agregações simples por filtros permitidos.','core')
on conflict(tool_key) do update set name=excluded.name,description=excluded.description,module_key=excluded.module_key,updated_at=now();
insert into public.permissions(key,name,module_key,resource,action,description) values
 ('chat.view','Visualizar chat','agents','chat','view','Permite visualizar conversas do chat geral.'),
 ('chat.use','Usar chat','agents','chat','use','Permite enviar mensagens ao chat geral.'),
 ('chat.archive','Arquivar chat','agents','chat','archive','Permite arquivar conversas do chat geral.'),
 ('chat.voice','Usar voz no chat','agents','chat','voice','Permite usar TTS e voz ao vivo do chat geral.'),
 ('knowledge.manage','Gerenciar base de conhecimento','agents','knowledge','manage','Permite cadastrar e publicar documentos de conhecimento.')
on conflict(key) do update set name=excluded.name,description=excluded.description,updated_at=now();
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('owner','admin','super_admin','administrador') and (p.key like 'chat.%' or p.key='knowledge.manage') on conflict do nothing;
