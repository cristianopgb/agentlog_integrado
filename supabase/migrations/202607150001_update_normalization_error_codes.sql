alter table public.normalization_errors
  drop constraint if exists normalization_errors_code_check;

alter table public.normalization_errors
  add constraint normalization_errors_code_check check (
    error_code in (
      'NO_VALID_RECORDS',
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
      'INVALID_CANONICAL_VALUE',
      'DOCUMENT_TYPE_NOT_ALLOWED',
      'STATUS_NOT_ALLOWED',
      'MAPPED_FIELD_NOT_APPLIED',
      'SOURCE_VALUE_NOT_FOUND',
      'TARGET_FIELD_NOT_FOUND',
      'INVALID_TARGET_ENTITY',
      'FIELD_MAPPING_LOAD_FAILED'
    )
  );
