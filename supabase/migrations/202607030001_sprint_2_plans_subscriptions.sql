create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  status text not null default 'active',
  monthly_price_cents integer not null default 0,
  annual_price_cents integer not null default 0,
  currency text not null default 'BRL',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_modules (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  is_included boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, module_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists public.subscription_limits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  key text not null,
  name text not null,
  limit_value integer,
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, key)
);

create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  metric_key text not null,
  quantity numeric not null default 0,
  unit text,
  recorded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_modules_plan_id on public.plan_modules(plan_id);
create index if not exists idx_plan_modules_module_id on public.plan_modules(module_id);
create index if not exists idx_subscriptions_tenant_id on public.subscriptions(tenant_id);
create index if not exists idx_subscriptions_plan_id on public.subscriptions(plan_id);
create index if not exists idx_subscription_limits_tenant_id on public.subscription_limits(tenant_id);
create index if not exists idx_subscription_limits_subscription_id on public.subscription_limits(subscription_id);
create index if not exists idx_usage_records_tenant_id on public.usage_records(tenant_id);
create index if not exists idx_usage_records_subscription_id on public.usage_records(subscription_id);
create index if not exists idx_usage_records_metric_key on public.usage_records(metric_key);

alter table public.plans enable row level security;
alter table public.plan_modules enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_limits enable row level security;
alter table public.usage_records enable row level security;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_updated_at') then
    drop trigger if exists set_plans_updated_at on public.plans;
    create trigger set_plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
    drop trigger if exists set_plan_modules_updated_at on public.plan_modules;
    create trigger set_plan_modules_updated_at before update on public.plan_modules for each row execute function public.set_updated_at();
    drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
    create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
    drop trigger if exists set_subscription_limits_updated_at on public.subscription_limits;
    create trigger set_subscription_limits_updated_at before update on public.subscription_limits for each row execute function public.set_updated_at();
  end if;
end $$;

drop policy if exists "authenticated can read active plans" on public.plans;
create policy "authenticated can read active plans" on public.plans for select to authenticated using (status = 'active');

drop policy if exists "authenticated can read active plan modules" on public.plan_modules;
create policy "authenticated can read active plan modules" on public.plan_modules for select to authenticated using (
  is_included and exists (select 1 from public.plans p where p.id = public.plan_modules.plan_id and p.status = 'active')
);

drop policy if exists "members can read own tenant subscriptions" on public.subscriptions;
create policy "members can read own tenant subscriptions" on public.subscriptions for select to authenticated using (public.is_member_of_tenant(tenant_id));

drop policy if exists "members can read own tenant subscription limits" on public.subscription_limits;
create policy "members can read own tenant subscription limits" on public.subscription_limits for select to authenticated using (public.is_member_of_tenant(tenant_id));

drop policy if exists "members can read own tenant usage records" on public.usage_records;
create policy "members can read own tenant usage records" on public.usage_records for select to authenticated using (public.is_member_of_tenant(tenant_id));

insert into public.plans (key, name, description, status, monthly_price_cents, annual_price_cents, currency, sort_order) values
  ('starter', 'Starter', 'Plano inicial com módulos essenciais para operação administrativa.', 'active', 9900, 99000, 'BRL', 10),
  ('professional', 'Professional', 'Plano intermediário com módulos comerciais e de transporte.', 'active', 19900, 199000, 'BRL', 20),
  ('enterprise', 'Enterprise', 'Plano completo com todos os módulos disponíveis na Sprint 2.', 'active', 39900, 399000, 'BRL', 30)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  monthly_price_cents = excluded.monthly_price_cents,
  annual_price_cents = excluded.annual_price_cents,
  currency = excluded.currency,
  sort_order = excluded.sort_order,
  updated_at = now();

with plan_module_seed(plan_key, module_key) as (
  values
    ('starter', 'core'), ('starter', 'atendimento'), ('starter', 'financeiro'),
    ('professional', 'core'), ('professional', 'transporte'), ('professional', 'atendimento'), ('professional', 'financeiro'),
    ('enterprise', 'core'), ('enterprise', 'transporte'), ('enterprise', 'atendimento'), ('enterprise', 'armazem'), ('enterprise', 'financeiro'), ('enterprise', 'equipes')
)
insert into public.plan_modules (plan_id, module_id, is_included)
select p.id, m.id, true
from plan_module_seed seed
join public.plans p on p.key = seed.plan_key
join public.modules m on m.key = seed.module_key
on conflict (plan_id, module_id) do update set is_included = excluded.is_included, updated_at = now();

insert into public.subscriptions (tenant_id, plan_id, status, started_at, current_period_start, current_period_end)
select t.id, p.id, 'active', now(), date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
from public.tenants t
join public.plans p on p.key = 'enterprise'
where t.slug = 'agentlog'
on conflict (tenant_id) do update set plan_id = excluded.plan_id, status = excluded.status, updated_at = now();

with limit_seed(key, name, limit_value, unit) as (
  values
    ('users_max', 'Usuários máximos', 10, 'users'),
    ('data_sources_max', 'Fontes de dados máximas', 5, 'sources'),
    ('monthly_import_records', 'Registros importados mensais', 10000, 'records'),
    ('monthly_ai_requests', 'Requisições IA mensais', 0, 'requests'),
    ('storage_mb', 'Armazenamento', 1024, 'MB')
)
insert into public.subscription_limits (tenant_id, subscription_id, key, name, limit_value, unit)
select s.tenant_id, s.id, ls.key, ls.name, ls.limit_value, ls.unit
from public.subscriptions s
join public.tenants t on t.id = s.tenant_id and t.slug = 'agentlog'
join limit_seed ls on true
on conflict (subscription_id, key) do update set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  limit_value = excluded.limit_value,
  unit = excluded.unit,
  updated_at = now();
