create table if not exists public.setup_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'not_started',
  priority text not null default 'normal',
  owner_user_id uuid references public.users_profile(id) on delete set null,
  started_at timestamptz,
  target_date date,
  completed_at timestamptz,
  progress_percent integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint setup_projects_status_check check (status in ('not_started','in_progress','blocked','waiting_customer','waiting_internal','completed','cancelled')),
  constraint setup_projects_priority_check check (priority in ('low','normal','high','urgent')),
  constraint setup_projects_progress_percent_check check (progress_percent between 0 and 100)
);

create table if not exists public.setup_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  setup_project_id uuid not null references public.setup_projects(id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  status text not null default 'not_started',
  sort_order integer not null default 0,
  owner_user_id uuid references public.users_profile(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(setup_project_id, key),
  constraint setup_steps_status_check check (status in ('not_started','in_progress','blocked','waiting_customer','waiting_internal','completed','cancelled'))
);

create table if not exists public.setup_checklist_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  setup_project_id uuid not null references public.setup_projects(id) on delete cascade,
  setup_step_id uuid references public.setup_steps(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending',
  is_required boolean not null default true,
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setup_checklist_items_status_check check (status in ('pending','in_progress','done','blocked','not_applicable'))
);

create index if not exists idx_setup_projects_tenant_id on public.setup_projects(tenant_id);
create index if not exists idx_setup_projects_status on public.setup_projects(status);
create index if not exists idx_setup_steps_tenant_id on public.setup_steps(tenant_id);
create index if not exists idx_setup_steps_setup_project_id on public.setup_steps(setup_project_id);
create index if not exists idx_setup_steps_status on public.setup_steps(status);
create index if not exists idx_setup_checklist_items_tenant_id on public.setup_checklist_items(tenant_id);
create index if not exists idx_setup_checklist_items_setup_project_id on public.setup_checklist_items(setup_project_id);
create index if not exists idx_setup_checklist_items_setup_step_id on public.setup_checklist_items(setup_step_id);
create index if not exists idx_setup_checklist_items_status on public.setup_checklist_items(status);

create trigger set_setup_projects_updated_at before update on public.setup_projects for each row execute function public.set_updated_at();
create trigger set_setup_steps_updated_at before update on public.setup_steps for each row execute function public.set_updated_at();
create trigger set_setup_checklist_items_updated_at before update on public.setup_checklist_items for each row execute function public.set_updated_at();

alter table public.setup_projects enable row level security;
alter table public.setup_steps enable row level security;
alter table public.setup_checklist_items enable row level security;

drop policy if exists "members can read own tenant setup projects" on public.setup_projects;
create policy "members can read own tenant setup projects" on public.setup_projects for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members can create setup projects with permission" on public.setup_projects;
create policy "members can create setup projects with permission" on public.setup_projects for insert to authenticated with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.projects.create'));
drop policy if exists "members can update setup projects with permission" on public.setup_projects;
create policy "members can update setup projects with permission" on public.setup_projects for update to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.projects.update')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.projects.update'));

drop policy if exists "members can read own tenant setup steps" on public.setup_steps;
create policy "members can read own tenant setup steps" on public.setup_steps for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members can update setup steps with permission" on public.setup_steps;
create policy "members can update setup steps with permission" on public.setup_steps for update to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.steps.update')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.steps.update'));

drop policy if exists "members can read own tenant setup checklist" on public.setup_checklist_items;
create policy "members can read own tenant setup checklist" on public.setup_checklist_items for select to authenticated using (public.is_member_of_tenant(tenant_id));
drop policy if exists "members can update setup checklist with permission" on public.setup_checklist_items;
create policy "members can update setup checklist with permission" on public.setup_checklist_items for update to authenticated using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.checklist.update')) with check (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id, 'setup.checklist.update'));

with permission_seed(key, name, module_key, resource, action, description) as (
  values
    ('setup.projects.view','Visualizar projetos de setup','setup','projects','view','Permite visualizar projetos de implantação.'),
    ('setup.projects.create','Criar projetos de setup','setup','projects','create','Permite criar projetos de implantação.'),
    ('setup.projects.update','Atualizar projetos de setup','setup','projects','update','Permite atualizar projetos de implantação.'),
    ('setup.steps.view','Visualizar etapas de setup','setup','steps','view','Permite visualizar etapas de implantação.'),
    ('setup.steps.update','Atualizar etapas de setup','setup','steps','update','Permite atualizar etapas de implantação.'),
    ('setup.checklist.view','Visualizar checklist de setup','setup','checklist','view','Permite visualizar checklist de implantação.'),
    ('setup.checklist.update','Atualizar checklist de setup','setup','checklist','update','Permite atualizar checklist de implantação.')
)
insert into public.permissions (key, name, module_key, resource, action, description)
select key, name, module_key, resource, action, description from permission_seed
on conflict (key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now();

insert into public.role_permissions (tenant_id, role_id, permission_id)
select r.tenant_id, r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'owner' and p.key like 'setup.%'
on conflict (tenant_id, role_id, permission_id) do nothing;

insert into public.setup_projects (tenant_id, name, description, status, priority, progress_percent)
select t.id, 'Implantação inicial AgentLog', 'Projeto inicial de implantação do tenant AgentLog.', 'in_progress', 'normal', 0
from public.tenants t where t.slug = 'agentlog'
on conflict do nothing;

with project as (select sp.id, sp.tenant_id from public.setup_projects sp join public.tenants t on t.id = sp.tenant_id where t.slug='agentlog' and sp.name='Implantação inicial AgentLog'),
step_seed(key,title,description,sort_order) as (values
('kickoff','Kickoff','Alinhamento inicial da implantação.',10),('accesses','Acessos','Conferência de acessos necessários.',20),('data_sources_inventory','Inventário de fontes de dados','Mapeamento simples das fontes de dados.',30),('data_contracts_preparation','Preparação de contratos de dados','Etapa preparatória, sem criar contratos nesta sprint.',40),('staging_preparation','Preparação de staging','Etapa preparatória, sem criar staging nesta sprint.',50),('validation','Validação','Validação do checklist de implantação.',60),('go_live','Go-live','Preparação para entrada em operação.',70))
insert into public.setup_steps (tenant_id, setup_project_id, key, title, description, sort_order)
select p.tenant_id, p.id, s.key, s.title, s.description, s.sort_order from project p cross join step_seed s
on conflict (setup_project_id, key) do nothing;

insert into public.setup_checklist_items (tenant_id, setup_project_id, setup_step_id, title, description, sort_order)
select ss.tenant_id, ss.setup_project_id, ss.id, 'Concluir ' || ss.title, 'Item inicial simples para a etapa ' || ss.title || '.', 10
from public.setup_steps ss join public.setup_projects sp on sp.id=ss.setup_project_id join public.tenants t on t.id=ss.tenant_id
where t.slug='agentlog' and sp.name='Implantação inicial AgentLog'
  and not exists (select 1 from public.setup_checklist_items sci where sci.setup_step_id=ss.id and sci.title='Concluir ' || ss.title);
