create table public.dashboard_ai_insights (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 dashboard_id uuid not null references public.dashboard_definitions(id) on delete cascade,
 agent_id uuid references public.ai_agents(id) on delete set null, ai_run_id uuid references public.ai_runs(id) on delete set null,
 filters_hash text, snapshot_hash text, input_snapshot jsonb not null default '{}'::jsonb, output_json jsonb not null default '{}'::jsonb,
 status text not null default 'completed' check(status in ('completed','failed')), dry_run boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create index dashboard_ai_insights_dashboard_created_idx on public.dashboard_ai_insights(tenant_id,dashboard_id,created_at desc);
create index dashboard_ai_insights_snapshot_idx on public.dashboard_ai_insights(tenant_id,dashboard_id,filters_hash,snapshot_hash);
alter table public.dashboard_ai_insights enable row level security;
create policy "tenant members dashboard_ai_insights" on public.dashboard_ai_insights for all to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
