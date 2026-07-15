-- Corrige definições obrigatórias de indicadores nativos para cálculo determinístico pela base nativa.
insert into public.native_indicator_definitions (
  module_key,family_key,indicator_key,name,description,indicator_type,visualization_type,value_format,calculation_type,calculation_config,required_fields,optional_fields,availability_rules,sort_order
) values
('core','frete','freight_per_kg','Frete por kg','Frete total dividido pelo peso bruto informado.','kpi','number','currency','ratio','{"table":"operation_records","numerator":{"operation":"sum","field":"freight_value"},"denominator":{"operation":"sum","field":"gross_weight"}}'::jsonb,'[{"key":"freight_value","label":"Frete","any_of":[{"table":"operation_records","field":"freight_value"}]},{"key":"gross_weight","label":"Peso bruto","any_of":[{"table":"operation_records","field":"gross_weight"}]}]'::jsonb,'[]'::jsonb,'{}'::jsonb,12),
('core','peso_volume','weight_by_destination_state','Peso por UF destino','Soma do peso bruto agrupada por UF de destino.','distribution','bar','kg','group_by','{"table":"operation_records","field":"gross_weight","group_field":"destination_state","aggregation":{"operation":"sum","field":"gross_weight"},"limit":50}'::jsonb,'[{"key":"gross_weight","label":"Peso bruto","any_of":[{"table":"operation_records","field":"gross_weight"}]},{"key":"destination_state","label":"UF destino","any_of":[{"table":"operation_records","field":"destination_state"}]}]'::jsonb,'[]'::jsonb,'{}'::jsonb,13)
on conflict (module_key, indicator_key) do update set
  family_key=excluded.family_key,
  name=excluded.name,
  description=excluded.description,
  indicator_type=excluded.indicator_type,
  visualization_type=excluded.visualization_type,
  value_format=excluded.value_format,
  calculation_type=excluded.calculation_type,
  calculation_config=excluded.calculation_config,
  required_fields=excluded.required_fields,
  optional_fields=excluded.optional_fields,
  availability_rules=excluded.availability_rules,
  sort_order=excluded.sort_order,
  updated_at=now();

update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"id"}'::jsonb where indicator_key='total_native_records';
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"gross_weight"}'::jsonb where indicator_key in ('total_weight_informed','transport_total_weight');
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"freight_value"}'::jsonb where indicator_key in ('total_freight_informed','transport_total_freight');
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"volume_count"}'::jsonb where indicator_key in ('total_volumes_informed','transport_total_volume_count');
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"customer_name","group_field":"customer_name","limit":50}'::jsonb where indicator_key in ('records_by_customer','transport_deliveries_by_customer');
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"status","group_field":"status","limit":50}'::jsonb where indicator_key='transport_deliveries_by_status';
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"gross_weight","group_field":"destination_state","aggregation":{"operation":"sum","field":"gross_weight"},"limit":50}'::jsonb where indicator_key in ('transport_weight_by_destination_state','weight_by_destination_state');
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"volume_count","group_field":"customer_name","aggregation":{"operation":"sum","field":"volume_count"},"limit":50}'::jsonb where indicator_key='transport_volumes_by_customer';
update public.native_indicator_definitions set calculation_type='time_series', calculation_config='{"table":"operation_records","field":"updated_at","date_field":"updated_at","granularity":"day","aggregation":{"operation":"count","field":"id"},"limit":100}'::jsonb where indicator_key='records_by_period';
update public.native_indicator_definitions set calculation_config='{"table":"operation_records","field":"completed_at","numerator":{"filter":[{"field":"completed_at","operator":"lte_field","compare_field":"expected_date"}]},"denominator":{"filter":[{"field":"completed_at","operator":"not_null"},{"field":"expected_date","operator":"not_null"}]}}'::jsonb where indicator_key='transport_otd';
update public.native_indicator_definitions set calculation_config='{"table":"transport_records","field":"sla_status","numerator":{"filter":[{"field":"sla_status","operator":"in","value":["met","on_time","cumprido"]}]},"denominator":{"filter":[{"field":"sla_status","operator":"not_null"}]}}'::jsonb where indicator_key='transport_sla_compliance';
