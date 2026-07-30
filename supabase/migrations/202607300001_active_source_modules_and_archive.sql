create table if not exists public.data_source_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  data_source_id uuid not null,
  module_key text not null,
  created_at timestamptz not null default now(),
  constraint data_source_modules_source_tenant_fk foreign key (data_source_id, tenant_id)
    references public.data_sources(id, tenant_id) on delete cascade,
  constraint data_source_modules_tenant_source_module_key unique (tenant_id, data_source_id, module_key)
);

create index if not exists idx_data_source_modules_active_lookup
  on public.data_source_modules (tenant_id, module_key, data_source_id);

alter table public.data_source_modules enable row level security;
drop policy if exists "members can read own tenant data source modules" on public.data_source_modules;
create policy "members can read own tenant data source modules" on public.data_source_modules
  for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members can manage own tenant data source modules" on public.data_source_modules;
create policy "members can manage own tenant data source modules" on public.data_source_modules
  for all to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'integrations.manage'))
  with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'integrations.manage'));

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
join public.permissions p on p.key = 'integrations.manage'
where r.key in ('owner', 'admin', 'super_admin', 'administrador')
on conflict (tenant_id, role_id, permission_id) do nothing;

insert into public.data_source_modules (tenant_id, data_source_id, module_key)
select tenant_id, id, module_key from public.data_sources
where nullif(trim(module_key), '') is not null
on conflict (tenant_id, data_source_id, module_key) do nothing;

update public.operation_records o
set is_current = false,
    canonical_validity_status = 'superseded',
    superseded_at = coalesce(o.superseded_at, now()),
    updated_at = now()
from public.data_sources ds
where ds.id = o.source_data_source_id
  and ds.tenant_id = o.tenant_id
  and ds.status in ('archived', 'inactive')
  and o.deleted_at is null
  and o.is_current = true;
