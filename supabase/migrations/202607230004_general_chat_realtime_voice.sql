-- Controlled observability for tenant-scoped Realtime voice sessions.
create table public.ai_voice_session_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  conversation_id uuid not null references public.ai_chat_conversations(id) on delete cascade,
  agent_id uuid references public.ai_agents(id) on delete set null,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  event_type text not null check (event_type in ('started','connected','user_spoke','tool_called','responded','ended','failed')),
  stage_failed text, error_code text, error_message_safe text, created_at timestamptz not null default now()
);
create index ai_voice_session_events_tenant_conversation_idx on public.ai_voice_session_events(tenant_id,conversation_id,created_at desc);
alter table public.ai_voice_session_events enable row level security;
create policy "tenant members ai voice events" on public.ai_voice_session_events for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
