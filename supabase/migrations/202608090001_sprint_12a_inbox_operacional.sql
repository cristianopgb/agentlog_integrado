-- Sprint 12-A: operational inbox and controlled external message intake.
create table public.contacts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text, phone text, email text, contact_type text not null default 'unknown', external_ref text,
  driver_id uuid, customer_id uuid, is_active boolean not null default true, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check (contact_type in ('driver','customer','recipient','shipper','employee','third_party','unknown'))
);
create unique index contacts_tenant_phone_unique on public.contacts(tenant_id, phone) where phone is not null;
create index contacts_tenant_phone_idx on public.contacts(tenant_id, phone);
create unique index contacts_tenant_id_id_unique on public.contacts(tenant_id, id);

create table public.inbox_conversations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_id uuid, channel text not null default 'manual', status text not null default 'open', assigned_user_id uuid,
  title text, last_message_at timestamptz, summary text, source_reference text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), closed_at timestamptz, deleted_at timestamptz,
  check (channel in ('manual','api','whatsapp','email','system')),
  check (status in ('open','waiting_contact','waiting_internal','assigned','closed','archived')),
  foreign key (tenant_id, contact_id) references public.contacts(tenant_id, id)
);
create unique index inbox_conversations_tenant_id_id_unique on public.inbox_conversations(tenant_id,id);
create index inbox_conversations_status_idx on public.inbox_conversations(tenant_id,status,last_message_at desc);
create index inbox_conversations_contact_idx on public.inbox_conversations(tenant_id,contact_id);

create table public.inbox_messages (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null, direction text not null, sender_type text not null, body text, media_url text, media_type text,
  provider_message_id text, status text not null default 'received', metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key (tenant_id,conversation_id) references public.inbox_conversations(tenant_id,id) on delete cascade,
  check (direction in ('inbound','outbound','internal')), check (sender_type in ('contact','user','agent','system'))
);
create index inbox_messages_conversation_idx on public.inbox_messages(tenant_id,conversation_id,created_at);

create table public.conversation_occurrence_links (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null, occurrence_id uuid not null,
  relationship_type text not null default 'related', created_by uuid, created_at timestamptz not null default now(), deleted_at timestamptz,
  foreign key (tenant_id,conversation_id) references public.inbox_conversations(tenant_id,id) on delete cascade,
  foreign key (tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade,
  unique (tenant_id,conversation_id,occurrence_id)
);
create index conversation_occurrence_links_conversation_idx on public.conversation_occurrence_links(tenant_id,conversation_id);
create index conversation_occurrence_links_occurrence_idx on public.conversation_occurrence_links(tenant_id,occurrence_id);

create table public.inbox_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null, event_type text not null, event_title text, event_description text, created_by uuid,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  foreign key (tenant_id,conversation_id) references public.inbox_conversations(tenant_id,id) on delete cascade
);
create table public.external_api_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null, token_hash text not null, is_active boolean not null default true,
  allowed_scope text not null default 'inbox.messages.create', created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index external_api_clients_token_hash_unique on public.external_api_clients(token_hash);

alter table public.contacts enable row level security;
alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.conversation_occurrence_links enable row level security;
alter table public.inbox_events enable row level security;
alter table public.external_api_clients enable row level security;

with permission_seed(key,name,module_key,resource,action,description) as (values
 ('occurrences.inbox.view','Visualizar Inbox','atendimento','inbox','view','Consulta conversas operacionais.'),
 ('occurrences.inbox.reply','Responder no Inbox','atendimento','inbox','reply','Registra respostas no Inbox.'),
 ('occurrences.inbox.assign','Assumir conversas','atendimento','inbox','assign','Atribui conversas.'),
 ('occurrences.inbox.close','Fechar conversas','atendimento','inbox','close','Fecha ou arquiva conversas.'),
 ('occurrences.inbox.link_occurrence','Vincular ocorrências','atendimento','inbox','link_occurrence','Vincula conversas e ocorrências.'),
 ('occurrences.inbox.create_message','Criar mensagens','atendimento','inbox','create_message','Registra mensagens manuais.'),
 ('contacts.view','Visualizar contatos','atendimento','contacts','view','Consulta contatos.'),
 ('contacts.create','Criar contatos','atendimento','contacts','create','Cria contatos.'),
 ('contacts.update','Atualizar contatos','atendimento','contacts','update','Atualiza contatos.'),
 ('external_api_clients.manage','Gerenciar clientes de API','atendimento','external_api_clients','manage','Gerencia credenciais externas por hash.')
) insert into public.permissions(key,name,module_key,resource,action,description) select * from permission_seed
on conflict(key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now();
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.key='owner' and (p.key like 'occurrences.inbox.%' or p.key like 'contacts.%' or p.key='external_api_clients.manage') on conflict do nothing;

create policy "contacts view" on public.contacts for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'contacts.view'));
create policy "contacts create" on public.contacts for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'contacts.create'));
create policy "contacts update" on public.contacts for update to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'contacts.update')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'contacts.update'));
create policy "inbox conversations view" on public.inbox_conversations for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.view'));
create policy "inbox conversations create" on public.inbox_conversations for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.create_message'));
create policy "inbox conversations update" on public.inbox_conversations for update to authenticated using (public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrences.inbox.assign') or public.user_has_permission(tenant_id,'occurrences.inbox.close') or public.user_has_permission(tenant_id,'occurrences.inbox.reply'))) with check (public.is_member_of_tenant(tenant_id));
create policy "inbox messages view" on public.inbox_messages for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.view'));
create policy "inbox messages create" on public.inbox_messages for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrences.inbox.reply') or public.user_has_permission(tenant_id,'occurrences.inbox.create_message')));
create policy "inbox links view" on public.conversation_occurrence_links for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.view'));
create policy "inbox links create" on public.conversation_occurrence_links for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.link_occurrence'));
create policy "inbox links delete" on public.conversation_occurrence_links for delete to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.link_occurrence'));
create policy "inbox events view" on public.inbox_events for select to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.inbox.view'));
-- Event writes and external client reads intentionally have no authenticated policy; the backend service role performs them.
