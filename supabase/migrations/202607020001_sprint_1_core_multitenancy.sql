create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  active_tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, module_id)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id)
);

create index if not exists idx_users_profile_active_tenant_id on public.users_profile(active_tenant_id);
create index if not exists idx_tenant_modules_tenant_id on public.tenant_modules(tenant_id);
create index if not exists idx_tenant_modules_module_id on public.tenant_modules(module_id);
create index if not exists idx_roles_tenant_id on public.roles(tenant_id);
create index if not exists idx_user_roles_tenant_id on public.user_roles(tenant_id);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ur.tenant_id from public.user_roles ur where ur.user_id = auth.uid()
$$;

create or replace function public.is_member_of_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.tenant_id = p_tenant_id
  )
$$;

alter table public.tenants enable row level security;
alter table public.users_profile enable row level security;
alter table public.modules enable row level security;
alter table public.tenant_modules enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;

create policy "users can read own profile" on public.users_profile for select to authenticated using (id = auth.uid());
create policy "users can read member tenants" on public.tenants for select to authenticated using (public.is_member_of_tenant(id));
create policy "users can read active tenant modules for own tenants" on public.tenant_modules for select to authenticated using (is_active and public.is_member_of_tenant(tenant_id));
create policy "users can read roles for own tenants" on public.roles for select to authenticated using (public.is_member_of_tenant(tenant_id));
create policy "users can read own user roles" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "users can read active modules" on public.modules for select to authenticated using (is_active);
create policy "users can read global permissions" on public.permissions for select to authenticated using (true);

create trigger set_tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger set_users_profile_updated_at before update on public.users_profile for each row execute function public.set_updated_at();
create trigger set_modules_updated_at before update on public.modules for each row execute function public.set_updated_at();
create trigger set_tenant_modules_updated_at before update on public.tenant_modules for each row execute function public.set_updated_at();
create trigger set_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger set_permissions_updated_at before update on public.permissions for each row execute function public.set_updated_at();

insert into public.modules (key, name, is_active) values
  ('core', 'Core', true),
  ('transporte', 'Transporte', true),
  ('atendimento', 'Atendimento', true),
  ('armazem', 'Armazém', true),
  ('financeiro', 'Financeiro', true),
  ('equipes', 'Equipes', true)
on conflict (key) do update set name = excluded.name, is_active = excluded.is_active;
