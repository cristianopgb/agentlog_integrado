alter table public.inbox_conversations
  add column if not exists summary_updated_at timestamptz;

create table if not exists public.inbox_message_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.inbox_conversations(id) on delete cascade,
  message_id uuid null references public.inbox_messages(id) on delete set null,
  occurrence_id uuid null references public.occurrences(id) on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by_type text not null check (uploaded_by_type in ('public_user','internal_user','agent')),
  created_by uuid null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);
create index if not exists inbox_message_attachments_conversation_idx on public.inbox_message_attachments(tenant_id, conversation_id) where deleted_at is null;
create index if not exists inbox_message_attachments_occurrence_idx on public.inbox_message_attachments(tenant_id, occurrence_id) where deleted_at is null;
create index if not exists inbox_message_attachments_message_idx on public.inbox_message_attachments(tenant_id, message_id) where deleted_at is null;
alter table public.inbox_message_attachments enable row level security;

-- Objetos são privados. A API com service role valida tenant/sessão e emite URL curta.
insert into storage.buckets (id, name, public)
values ('inbox-attachments', 'inbox-attachments', false)
on conflict (id) do update set public = false;
