-- Correção conceitual do Catálogo de Indicadores Nativos.
-- Mantém o catálogo pronto desde o nascimento do sistema e garante que a disponibilidade
-- seja não bloqueante e calculada somente sobre campos da base nativa/canônica.

update public.native_indicator_definitions
set
  module_key = 'core',
  family_key = 'qualidade_base',
  description = 'Conta registros existentes na base nativa/canônica do sistema, sem considerar origem, conector, planilha, API ou lote.',
  calculation_config = '{"table":"operation_records","field":"id"}'::jsonb,
  required_fields = '[{"key":"registro_nativo","label":"Registro nativo","any_of":[{"table":"operation_records","field":"id"}]}]'::jsonb,
  optional_fields = '[]'::jsonb,
  availability_rules = jsonb_build_object('non_blocking', true, 'source_agnostic', true, 'waiting_status', 'waiting_data'),
  default_visibility = 'auto',
  available_for_dashboard = true,
  available_for_reports = true,
  status = 'active',
  updated_at = now()
where indicator_key = 'total_native_records';

update public.native_indicator_definitions
set
  availability_rules = coalesce(availability_rules, '{}'::jsonb) || jsonb_build_object('non_blocking', true, 'source_agnostic', true, 'waiting_status', 'waiting_data'),
  default_visibility = 'auto',
  available_for_dashboard = true,
  available_for_reports = true,
  status = 'active',
  updated_at = now()
where is_system = true
  and status = 'active'
  and family_key not in ('tecnico', 'técnico', 'debug', 'interno');

update public.native_indicator_definitions
set
  default_visibility = 'hidden',
  available_for_dashboard = false,
  available_for_reports = false,
  availability_rules = coalesce(availability_rules, '{}'::jsonb) || jsonb_build_object('non_blocking', true, 'source_agnostic', true, 'internal', true),
  updated_at = now()
where is_system = true
  and family_key in ('tecnico', 'técnico', 'debug', 'interno');

update public.native_indicator_definitions
set
  module_key = case module_key when 'attendance' then 'attendance' else module_key end,
  updated_at = now()
where module_key in ('core', 'transport', 'finance', 'attendance', 'warehouse', 'team');
