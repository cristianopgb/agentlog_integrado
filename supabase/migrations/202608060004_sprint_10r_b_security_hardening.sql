-- Sprint 10R-B hardening only: protect SECURITY DEFINER seed helpers and make
-- requirement-to-reason ownership structurally tenant-aware.

revoke all on function public.seed_native_occurrence_reasons(uuid) from public;
revoke all on function public.seed_native_occurrence_reasons(uuid) from anon;
revoke all on function public.seed_native_occurrence_reasons(uuid) from authenticated;

revoke all on function public.seed_occurrence_catalog_for_tenant() from public;
revoke all on function public.seed_occurrence_catalog_for_tenant() from anon;
revoke all on function public.seed_occurrence_catalog_for_tenant() from authenticated;

-- PostgreSQL invokes a trigger function through the trigger machinery, without
-- requiring EXECUTE for the session role. The tenants trigger therefore remains
-- operational while direct RPC/function execution is denied.

alter table public.occurrence_reasons
  add constraint occurrence_reasons_tenant_id_id_key unique (tenant_id, id);

alter table public.occurrence_reason_requirements
  drop constraint occurrence_reason_requirements_reason_id_fkey,
  add constraint occurrence_reason_requirements_tenant_reason_fkey
    foreign key (tenant_id, reason_id)
    references public.occurrence_reasons (tenant_id, id)
    on delete cascade;

-- Migration-time verification: fail deployment if a client role can execute a
-- seed helper or if the composite tenant/reason FK was not installed.
do $$
begin
  if has_function_privilege('anon', 'public.seed_native_occurrence_reasons(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.seed_native_occurrence_reasons(uuid)', 'execute')
    or has_function_privilege('anon', 'public.seed_occurrence_catalog_for_tenant()', 'execute')
    or has_function_privilege('authenticated', 'public.seed_occurrence_catalog_for_tenant()', 'execute') then
    raise exception 'occurrence catalog seed functions are executable by a client role';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.occurrence_reason_requirements'::regclass
      and conname = 'occurrence_reason_requirements_tenant_reason_fkey'
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.occurrence_reason_requirements'::regclass and attname = 'tenant_id'),
        (select attnum from pg_attribute where attrelid = 'public.occurrence_reason_requirements'::regclass and attname = 'reason_id')
      ]::smallint[]
  ) then
    raise exception 'tenant-aware occurrence reason requirement FK is missing';
  end if;
end $$;
