alter table public.permissions add column if not exists module_key text;
alter table public.permissions add column if not exists resource text;
alter table public.permissions add column if not exists action text;
alter table public.permissions add column if not exists description text;

create unique index if not exists idx_permissions_module_resource_action on public.permissions(module_key, resource, action) where module_key is not null and resource is not null and action is not null;

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (tenant_id, role_id, permission_id)
);

create index if not exists idx_role_permissions_tenant_id on public.role_permissions(tenant_id);
create index if not exists idx_role_permissions_role_id on public.role_permissions(role_id);
create index if not exists idx_role_permissions_permission_id on public.role_permissions(permission_id);

alter table public.role_permissions enable row level security;

drop policy if exists "members can read own tenant role permissions" on public.role_permissions;
create policy "members can read own tenant role permissions" on public.role_permissions for select to authenticated using (public.is_member_of_tenant(tenant_id));

create or replace function public.user_has_permission(p_tenant_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.tenant_id = ur.tenant_id and rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = p_tenant_id
      and p.key = p_permission_key
  )
$$;

create or replace function public.user_has_permission(p_tenant_id uuid, p_module_key text, p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.tenant_id = ur.tenant_id and rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.tenant_id = p_tenant_id
      and p.module_key = p_module_key
      and p.resource = p_resource
      and p.action = p_action
  )
$$;

with permission_seed(key, name, module_key, resource, action, description) as (
  values
    ('core.app.view', 'Visualizar app', 'core', 'app', 'view', 'Permite acessar a área autenticada inicial.'),
    ('core.tenants.view', 'Visualizar tenants', 'core', 'tenants', 'view', 'Permite listar tenants vinculados ao usuário.'),
    ('core.modules.view', 'Visualizar módulos core', 'core', 'modules', 'view', 'Permite consultar módulos disponíveis e ativos.'),
    ('core.roles.view', 'Visualizar roles', 'core', 'roles', 'view', 'Permite listar roles do tenant ativo.'),
    ('core.permissions.view', 'Visualizar permissões', 'core', 'permissions', 'view', 'Permite listar permissões disponíveis.'),
    ('commercial.plans.view', 'Visualizar planos', 'commercial', 'plans', 'view', 'Permite consultar planos comerciais.'),
    ('commercial.subscription.view', 'Visualizar assinatura', 'commercial', 'subscription', 'view', 'Permite consultar assinatura e limites do tenant.'),
    ('commercial.modules.view', 'Visualizar módulos comerciais', 'commercial', 'modules', 'view', 'Permite consultar visão comercial de módulos.'),
    ('commercial.usage.view', 'Visualizar uso', 'commercial', 'usage', 'view', 'Permite consultar registros de uso do tenant.')
)
insert into public.permissions (key, name, module_key, resource, action, description)
select key, name, module_key, resource, action, description from permission_seed
on conflict (key) do update set
  name = excluded.name,
  module_key = excluded.module_key,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  updated_at = now();

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'owner'
  and p.key in (
    'core.app.view',
    'core.tenants.view',
    'core.modules.view',
    'core.roles.view',
    'core.permissions.view',
    'commercial.plans.view',
    'commercial.subscription.view',
    'commercial.modules.view',
    'commercial.usage.view'
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
