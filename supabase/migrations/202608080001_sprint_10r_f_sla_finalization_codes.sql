-- Sprint 10R-F: catálogo controlado e numeração concorrente por tenant.
create table public.occurrence_code_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  description text not null,
  kind text not null check (kind in ('reason','closure')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (tenant_id, code, kind)
);
create table public.tenant_occurrence_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_number bigint not null default 1 check (next_number > 0),
  updated_at timestamptz not null default now()
);
alter table public.occurrence_code_catalog enable row level security;
alter table public.tenant_occurrence_counters enable row level security;
create policy "occurrence code catalog view" on public.occurrence_code_catalog for select to authenticated
  using (public.is_member_of_tenant(tenant_id) and public.user_has_permission(tenant_id,'occurrences.view'));
create policy "occurrence counter tenant isolation" on public.tenant_occurrence_counters for select to authenticated
  using (false);

create or replace function public.seed_occurrence_codes(p_tenant_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.occurrence_code_catalog(tenant_id,code,description,kind) values
    (p_tenant_id,'00','Entregue com sucesso','closure'),
    (p_tenant_id,'01','Falta','reason'),
    (p_tenant_id,'02','Avaria','reason'),
    (p_tenant_id,'03','Entrega parcial','closure'),
    (p_tenant_id,'04','Devolução total','closure'),
    (p_tenant_id,'05','Cancelada','closure')
  on conflict (tenant_id,code,kind) do nothing;
$$;
select public.seed_occurrence_codes(id) from public.tenants;
create or replace function public.seed_occurrence_codes_for_new_tenant() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  perform public.seed_occurrence_codes(new.id); return new;
end $$;
create trigger seed_occurrence_codes_after_tenant after insert on public.tenants
for each row execute function public.seed_occurrence_codes_for_new_tenant();

create or replace function public.next_tenant_occurrence_number(p_tenant_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare allocated bigint;
begin
  insert into public.tenant_occurrence_counters(tenant_id,next_number)
  values (p_tenant_id,2)
  on conflict (tenant_id) do update
    set next_number=public.tenant_occurrence_counters.next_number+1, updated_at=now()
  returning next_number-1 into allocated;
  return 'OC' || lpad(allocated::text,7,'0');
end $$;
revoke all on function public.next_tenant_occurrence_number(uuid) from public, anon, authenticated;
grant execute on function public.next_tenant_occurrence_number(uuid) to service_role;
