alter table public.normalization_errors
  drop constraint if exists normalization_errors_code_check;

alter table public.normalization_errors
  add constraint normalization_errors_code_check check (error_code in (
    'NO_VALID_RECORDS',
    'NO_VALID_STAGING_RECORDS',
    'EMPTY_NORMALIZED_PAYLOAD',
    'NO_FIELD_MAPPINGS',
    'INVALID_STAGING_BATCH',
    'INVALID_STAGING_RECORD',
    'MISSING_OPERATION_RECORD',
    'INVALID_CANONICAL_ENTITY',
    'INVALID_CANONICAL_FIELD',
    'INVALID_VALUE_TYPE',
    'REQUIRED_VALUE_MISSING',
    'MODULE_NOT_ENABLED',
    'UPSERT_FAILED',
    'UNKNOWN_ERROR',
    'FIELD_MAPPING_LOAD_FAILED',
    'INVALID_CANONICAL_VALUE',
    'SCHEMA_INCOMPATIBLE'
  ));

alter table public.canonical_integrations
  drop constraint if exists canonical_integrations_integration_type_check;

alter table public.canonical_integrations
  add constraint canonical_integrations_integration_type_check
  check (integration_type in ('spreadsheet', 'manual_file', 'api'));
