-- Sprint Dashboard MVP
create table if not exists public.dashboard_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  layout_config jsonb not null default '{}'::jsonb,
  published_version_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dashboard_id uuid not null references public.dashboard_definitions(id) on delete cascade,
  indicator_source text not null check (indicator_source in ('native','custom')),
  indicator_id text not null,
  title text not null,
  visual_type text not null check (visual_type in ('kpi','table','matrix','bar','pie','line')),
  position jsonb not null default '{"x":0,"y":0,"w":3,"h":2}'::jsonb,
  properties jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.dashboard_filters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dashboard_id uuid not null references public.dashboard_definitions(id) on delete cascade,
  field_id uuid references public.indicator_field_catalog(id),
  field_key text not null,
  label text not null,
  operator text not null,
  value jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.dashboard_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dashboard_id uuid not null references public.dashboard_definitions(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, dashboard_id, version_number)
);
create index if not exists idx_dashboard_definitions_tenant on public.dashboard_definitions(tenant_id, updated_at desc);
create index if not exists idx_dashboard_widgets_tenant_dashboard on public.dashboard_widgets(tenant_id, dashboard_id);
create index if not exists idx_dashboard_filters_tenant_dashboard on public.dashboard_filters(tenant_id, dashboard_id);
create index if not exists idx_dashboard_versions_tenant_dashboard on public.dashboard_versions(tenant_id, dashboard_id, version_number desc);
alter table public.dashboard_definitions enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.dashboard_filters enable row level security;
alter table public.dashboard_versions enable row level security;
drop policy if exists "members read dashboards" on public.dashboard_definitions;
create policy "members read dashboards" on public.dashboard_definitions for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members read dashboard widgets" on public.dashboard_widgets;
create policy "members read dashboard widgets" on public.dashboard_widgets for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members read dashboard filters" on public.dashboard_filters;
create policy "members read dashboard filters" on public.dashboard_filters for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members read dashboard versions" on public.dashboard_versions;
create policy "members read dashboard versions" on public.dashboard_versions for select to authenticated using (public.is_member_of_tenant(tenant_id));
-- A API usa service role no backend e valida permissões com AuthGuard/PermissionsGuard.
-- As policies abaixo mantêm segurança básica caso clientes autenticados usem RLS diretamente.
drop policy if exists "members insert dashboards" on public.dashboard_definitions;
create policy "members insert dashboards" on public.dashboard_definitions for insert to authenticated with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members update dashboards" on public.dashboard_definitions;
create policy "members update dashboards" on public.dashboard_definitions for update to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members delete dashboards" on public.dashboard_definitions;
create policy "members delete dashboards" on public.dashboard_definitions for delete to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members insert dashboard widgets" on public.dashboard_widgets;
create policy "members insert dashboard widgets" on public.dashboard_widgets for insert to authenticated with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members update dashboard widgets" on public.dashboard_widgets;
create policy "members update dashboard widgets" on public.dashboard_widgets for update to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members delete dashboard widgets" on public.dashboard_widgets;
create policy "members delete dashboard widgets" on public.dashboard_widgets for delete to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members insert dashboard filters" on public.dashboard_filters;
create policy "members insert dashboard filters" on public.dashboard_filters for insert to authenticated with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members update dashboard filters" on public.dashboard_filters;
create policy "members update dashboard filters" on public.dashboard_filters for update to authenticated using (public.is_member_of_tenant(tenant_id)) with check (public.is_member_of_tenant(tenant_id));
drop policy if exists "members delete dashboard filters" on public.dashboard_filters;
create policy "members delete dashboard filters" on public.dashboard_filters for delete to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members insert dashboard versions" on public.dashboard_versions;
create policy "members insert dashboard versions" on public.dashboard_versions for insert to authenticated with check (public.is_member_of_tenant(tenant_id));
with permission_seed(key, name, module_key, resource, action, description) as (values
 ('dashboards.view','Visualizar dashboards','dashboards','dashboards','view','Permite visualizar dashboards.'),
 ('dashboards.manage','Gerenciar dashboards','dashboards','dashboards','manage','Permite criar e editar dashboards.'),
 ('dashboards.publish','Publicar dashboards','dashboards','dashboards','publish','Permite publicar snapshots de dashboards.'),
 ('dashboards.preview','Pré-visualizar dashboards','dashboards','dashboards','preview','Permite executar prévias de widgets do dashboard.')
)
insert into public.permissions (key,name,module_key,resource,action,description)
select * from permission_seed
on conflict (key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now();
insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id from public.roles r cross join public.permissions p
where r.key in ('owner','admin','super_admin','administrador') and p.key in ('dashboards.view','dashboards.manage','dashboards.publish','dashboards.preview')
on conflict (tenant_id, role_id, permission_id) do nothing;
