-- Sprint 10R-F hardening only: restrict SECURITY DEFINER helpers and make the
-- tenant occurrence number invariant explicit without changing historical data.
revoke all on function public.seed_occurrence_codes(uuid) from public, anon, authenticated;
revoke all on function public.seed_occurrence_codes_for_new_tenant() from public, anon, authenticated;

do $$
declare
  has_equivalent_unique boolean;
  duplicate_tenant uuid;
  duplicate_number text;
begin
  select exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.occurrences'::regclass
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.occurrences'::regclass and attname = 'tenant_id'),
        (select attnum from pg_catalog.pg_attribute where attrelid = 'public.occurrences'::regclass and attname = 'occurrence_number')
      ]::smallint[]
  ) into has_equivalent_unique;

  if not has_equivalent_unique then
    select tenant_id, occurrence_number
      into duplicate_tenant, duplicate_number
    from public.occurrences
    group by tenant_id, occurrence_number
    having count(*) > 1
    limit 1;

    if duplicate_tenant is not null then
      raise exception
        'Não foi possível garantir unicidade de occurrence_number: duplicidade histórica no tenant %, número %. Nenhum registro foi alterado.',
        duplicate_tenant, duplicate_number;
    end if;

    alter table public.occurrences
      add constraint occurrences_tenant_occurrence_number_key
      unique (tenant_id, occurrence_number);
  end if;
end
$$;
