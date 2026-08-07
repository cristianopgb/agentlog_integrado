-- Sprint 10R-E: operational treatments, pending actions, SLA and structured closure.
alter table public.occurrences add column if not exists sla_status text not null default 'not_started';
alter table public.occurrences add column if not exists closed_reason text;
alter table public.occurrences add column if not exists closed_notes text;
alter table public.occurrences add column if not exists closed_by uuid;
alter table public.occurrences add column if not exists resolution_summary text;
alter table public.occurrences drop constraint if exists occurrences_sla_status_check;
alter table public.occurrences add constraint occurrences_sla_status_check check (sla_status in ('not_started','on_track','at_risk','overdue','met','breached','not_applicable'));

create table if not exists public.occurrence_treatments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null,
 event_id uuid, treatment_type text not null, description text not null, responsible_user_id uuid, responsible_team text,
 status text not null default 'open', started_at timestamptz, completed_at timestamptz, created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 constraint occurrence_treatments_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade,
 constraint occurrence_treatments_event_fkey foreign key(tenant_id,occurrence_id,event_id) references public.occurrence_events(tenant_id,occurrence_id,id),
 check(treatment_type in ('contact_driver','contact_customer','contact_shipper','contact_recipient','internal_analysis','request_document','request_authorization','schedule_redelivery','confirm_return','financial_validation','operational_action','other')),
 check(status in ('open','in_progress','waiting','done','canceled'))
);
create table if not exists public.occurrence_pending_actions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), occurrence_id uuid not null,
 event_id uuid, title text not null, description text, responsible_user_id uuid, responsible_team text, due_at timestamptz,
 status text not null default 'open', completed_at timestamptz, created_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 constraint occurrence_pending_actions_tenant_occurrence_fkey foreign key(tenant_id,occurrence_id) references public.occurrences(tenant_id,id) on delete cascade,
 constraint occurrence_pending_actions_event_fkey foreign key(tenant_id,occurrence_id,event_id) references public.occurrence_events(tenant_id,occurrence_id,id),
 check(status in ('open','in_progress','done','canceled'))
);

do $$ declare t text; begin foreach t in array array['occurrence_treatments','occurrence_pending_actions'] loop
 execute format('create index if not exists %I on public.%I(tenant_id)',t||'_tenant_idx',t);
 execute format('create index if not exists %I on public.%I(occurrence_id)',t||'_occurrence_idx',t);
 execute format('create index if not exists %I on public.%I(tenant_id,occurrence_id) where deleted_at is null',t||'_tenant_occurrence_active_idx',t);
 execute format('alter table public.%I enable row level security',t);
 end loop; end $$;

with p(key,name,resource,action) as (values
 ('occurrence_treatments.view','Visualizar tratativas','occurrence_treatments','view'),('occurrence_treatments.create','Criar tratativas','occurrence_treatments','create'),('occurrence_treatments.update','Atualizar tratativas','occurrence_treatments','update'),('occurrence_treatments.delete','Remover tratativas','occurrence_treatments','delete'),
 ('occurrence_pending_actions.view','Visualizar pendências','occurrence_pending_actions','view'),('occurrence_pending_actions.create','Criar pendências','occurrence_pending_actions','create'),('occurrence_pending_actions.update','Atualizar pendências','occurrence_pending_actions','update'),('occurrence_pending_actions.delete','Remover pendências','occurrence_pending_actions','delete'),
 ('occurrences.sla.update','Atualizar SLA','occurrences','sla.update'),('occurrences.close','Fechar ocorrências','occurrences','close'))
insert into public.permissions(key,name,module_key,resource,action,description) select key,name,'atendimento',resource,action,name||' da ocorrência.' from p on conflict(key) do nothing;
insert into public.role_permissions(tenant_id,role_id,permission_id) select r.tenant_id,r.id,p.id from public.roles r cross join public.permissions p where r.key='owner' and p.key in ('occurrence_treatments.view','occurrence_treatments.create','occurrence_treatments.update','occurrence_treatments.delete','occurrence_pending_actions.view','occurrence_pending_actions.create','occurrence_pending_actions.update','occurrence_pending_actions.delete','occurrences.sla.update','occurrences.close') on conflict do nothing;

create policy "occurrence treatments view" on public.occurrence_treatments for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_treatments.view'));
create policy "occurrence treatments create" on public.occurrence_treatments for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_treatments.create'));
create policy "occurrence treatments update" on public.occurrence_treatments for update to authenticated using(public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrence_treatments.update') or public.user_has_permission(tenant_id,'occurrence_treatments.delete'))) with check(public.is_member_of_tenant(tenant_id));
create policy "occurrence pending actions view" on public.occurrence_pending_actions for select to authenticated using(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_pending_actions.view'));
create policy "occurrence pending actions create" on public.occurrence_pending_actions for insert to authenticated with check(public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrence_pending_actions.create'));
create policy "occurrence pending actions update" on public.occurrence_pending_actions for update to authenticated using(public.is_member_of_tenant(tenant_id) and (public.user_has_permission(tenant_id,'occurrence_pending_actions.update') or public.user_has_permission(tenant_id,'occurrence_pending_actions.delete'))) with check(public.is_member_of_tenant(tenant_id));
