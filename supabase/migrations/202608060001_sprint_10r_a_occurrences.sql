-- Sprint 10R-A: occurrences are the transactional source of truth. attendance_records
-- remains the canonical analytical base; a future deterministic projection will
-- connect both. Dashboards and reports continue to use the global engines.
create table public.occurrence_reason_categories (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  name text not null, description text, is_active boolean not null default true,
  is_system boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create table public.occurrence_reason_templates (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  category_id uuid not null references public.occurrence_reason_categories(id), code text not null, name text not null,
  description text, is_active boolean not null default true, is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create table public.occurrence_reasons (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  template_id uuid references public.occurrence_reason_templates(id), category_id uuid not null references public.occurrence_reason_categories(id),
  code text not null, name text not null, description text, is_active boolean not null default true,
  is_custom boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (tenant_id, code)
);

create table public.occurrences (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_number text not null,
  title text not null, description text, current_status text not null default 'open', current_priority text not null default 'medium',
  source_channel text not null default 'manual', current_owner_id uuid, opened_at timestamptz not null default now(), due_at timestamptz,
  resolved_at timestamptz, closed_at timestamptz, created_by uuid, updated_by uuid, created_by_type text not null default 'user',
  source_reference text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique (tenant_id, occurrence_number),
  check (current_status in ('draft','open','triage','in_progress','waiting_driver','waiting_customer','waiting_carrier','waiting_approval','waiting_document','waiting_payment','waiting_redelivery','waiting_return','partially_resolved','resolved','closed','canceled','reopened')),
  check (current_priority in ('low','medium','high','critical'))
);
create table public.occurrence_operation_links (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade, operation_record_id uuid not null references public.operation_records(id),
  relationship_type text not null default 'affected', is_primary boolean not null default false, linked_at timestamptz not null default now(),
  linked_by uuid, snapshot jsonb not null default '{}'::jsonb, unique (occurrence_id, operation_record_id),
  check (relationship_type in ('primary','affected','source','related','return','complementary'))
);
create unique index occurrence_one_primary_operation on public.occurrence_operation_links(occurrence_id) where is_primary;
create table public.occurrence_events (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
  occurrence_id uuid not null references public.occurrences(id) on delete cascade, reason_id uuid references public.occurrence_reasons(id),
  event_type text not null, event_status text not null default 'reported', event_title text, event_description text,
  event_at timestamptz not null default now(), created_by uuid, created_by_type text not null default 'user', source_channel text not null default 'manual',
  source_reference text, old_status text, new_status text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index occurrences_tenant_status_idx on public.occurrences(tenant_id,current_status,opened_at desc) where deleted_at is null;
create index occurrence_events_timeline_idx on public.occurrence_events(tenant_id,occurrence_id,event_at,created_at);

create or replace function public.prevent_occurrence_event_mutation() returns trigger language plpgsql as $$ begin raise exception 'occurrence_events are append-only'; end $$;
create trigger occurrence_events_no_update before update or delete on public.occurrence_events for each row execute function public.prevent_occurrence_event_mutation();

alter table public.occurrences enable row level security;
alter table public.occurrence_operation_links enable row level security;
alter table public.occurrence_events enable row level security;
alter table public.occurrence_reason_categories enable row level security;
alter table public.occurrence_reason_templates enable row level security;
alter table public.occurrence_reasons enable row level security;

with permission_seed(key,name,module_key,resource,action,description) as (values
 ('occurrences.view','Visualizar ocorrências','atendimento','occurrences','view','Consulta ocorrências operacionais.'),
 ('occurrences.create','Criar ocorrências','atendimento','occurrences','create','Cria ocorrências operacionais.'),
 ('occurrences.update','Atualizar ocorrências','atendimento','occurrences','update','Atualiza ocorrências operacionais.'),
 ('occurrences.assign','Atribuir ocorrências','atendimento','occurrences','assign','Atribui responsáveis.'),
 ('occurrences.cancel','Cancelar ocorrências','atendimento','occurrences','cancel','Cancela ocorrências.'),
 ('occurrences.resolve','Resolver ocorrências','atendimento','occurrences','resolve','Resolve ocorrências.'),
 ('occurrences.kanban.view','Visualizar kanban','atendimento','occurrences_kanban','view','Consulta kanban operacional.'),
 ('occurrences.kanban.move','Mover no kanban','atendimento','occurrences_kanban','move','Move ocorrências entre status.'),
 ('occurrence_events.create','Criar eventos','atendimento','occurrence_events','create','Registra eventos append-only.'),
 ('occurrence_operation_links.create','Vincular operações','atendimento','occurrence_operation_links','create','Vincula operações tratadas.'),
 ('occurrence_operation_links.delete','Desvincular operações','atendimento','occurrence_operation_links','delete','Remove vínculo operacional.'),
 ('occurrence_reasons.view','Visualizar motivos','atendimento','occurrence_reasons','view','Consulta motivos ativos.'),
 ('occurrence_reasons.create','Criar motivos','atendimento','occurrence_reasons','create','Cria motivos personalizados.'),
 ('occurrence_reasons.update','Atualizar motivos','atendimento','occurrence_reasons','update','Atualiza motivos personalizados.')
)
insert into public.permissions(key,name,module_key,resource,action,description) select * from permission_seed
on conflict(key) do update set name=excluded.name,module_key=excluded.module_key,resource=excluded.resource,action=excluded.action,description=excluded.description,updated_at=now();
insert into public.role_permissions(tenant_id,role_id,permission_id)
select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p
where r.key='owner' and (p.key like 'occurrences.%' or p.key like 'occurrence_%') on conflict do nothing;
