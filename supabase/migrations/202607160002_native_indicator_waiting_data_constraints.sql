-- Ajustes técnicos finais para o status waiting_data em cálculos de indicadores nativos.

update public.native_indicator_definitions
set calculation_config = jsonb_set(
  calculation_config - 'where',
  '{filter}',
  '[{"table":"operation_records","field":"data_quality_status","operator":"eq","value":"valid"}]'::jsonb,
  true
), updated_at = now()
where indicator_key = 'complete_native_records'
  and calculation_config ? 'where';

update public.native_indicator_definitions
set calculation_config = jsonb_set(
  calculation_config - 'where',
  '{filter}',
  '[{"table":"operation_records","field":"data_quality_status","operator":"eq","value":"partial"}]'::jsonb,
  true
), updated_at = now()
where indicator_key = 'partial_native_records'
  and calculation_config ? 'where';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.native_indicator_calculation_logs'::regclass
      and conname = 'native_indicator_calculation_logs_availability_status_check'
  ) then
    alter table public.native_indicator_calculation_logs
      drop constraint native_indicator_calculation_logs_availability_status_check;
  end if;

  alter table public.native_indicator_calculation_logs
    add constraint native_indicator_calculation_logs_availability_status_check
    check (availability_status in ('available', 'partial', 'waiting_data', 'empty', 'failed'));
end $$;
