-- Ajusta indicadores nativos de prazo para usar fallback controlado entre campos canônicos.
-- O motor continua limitado a tabelas/campos validados por safeTable/safeField.

update public.native_indicator_definitions
set calculation_config = '{
  "denominator": {
    "filter": [
      {"table":"operation_records","field":"expected_date","operator":"not_null"},
      {"coalesce":[{"table":"operation_records","field":"completed_at"},{"table":"transport_records","field":"delivered_at"}],"operator":"not_null"}
    ]
  },
  "numerator": {
    "filter": [
      {"coalesce":[{"table":"operation_records","field":"completed_at"},{"table":"transport_records","field":"delivered_at"}],"operator":"lte_field","compare_table":"operation_records","compare_field":"expected_date"}
    ]
  }
}'::jsonb,
updated_at = now()
where indicator_key = 'transport_otd';

update public.native_indicator_definitions
set calculation_config = '{
  "filter": [
    {"table":"operation_records","field":"expected_date","operator":"not_null"},
    {"coalesce":[{"table":"operation_records","field":"completed_at"},{"table":"transport_records","field":"delivered_at"}],"operator":"gt_field","compare_table":"operation_records","compare_field":"expected_date"}
  ]
}'::jsonb,
updated_at = now()
where indicator_key = 'transport_delayed_deliveries';

update public.native_indicator_definitions
set calculation_config = '{
  "date_pairs": [
    {"start":{"table":"operation_records","field":"expected_date"},"end":{"coalesce":[{"table":"operation_records","field":"completed_at"},{"table":"transport_records","field":"delivered_at"}]}}
  ],
  "unit":"hours",
  "positive_only": true
}'::jsonb,
updated_at = now()
where indicator_key in ('transport_average_delay','transport_avg_delay');

update public.native_indicator_definitions
set calculation_config = '{
  "filter": [
    {"table":"operation_records","field":"expected_date","operator":"lt_today"},
    {"table":"operation_records","field":"completed_at","operator":"is_null"},
    {"table":"transport_records","field":"delivered_at","operator":"is_null"}
  ]
}'::jsonb,
updated_at = now()
where indicator_key in ('transport_overdue_open_deliveries','transport_open_overdue_deliveries');
