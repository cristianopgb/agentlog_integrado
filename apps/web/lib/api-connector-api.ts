import { createBrowserSupabaseClient } from './supabase';
const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('API backend não configurada.');
  const token = createBrowserSupabaseClient().auth.getAccessToken();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as {
      message?: string;
      source_field_name?: string;
      sample_value?: unknown;
      received_format?: string | null;
    };
    const details = [
      error.source_field_name && `campo: ${error.source_field_name}`,
      error.sample_value !== undefined &&
        `amostra: ${JSON.stringify(error.sample_value)}`,
      error.received_format !== undefined &&
        `formato recebido: ${error.received_format ?? 'não informado'}`,
    ].filter(Boolean);
    throw new Error(
      `${error.message ?? 'Falha na integração API.'}${details.length ? ` (${details.join('; ')})` : ''}`,
    );
  }
  return body as T;
}
export type ApiConnectorConfig = {
  base_url: string;
  endpoint_path: string;
  auth_type: string;
  auth_header_name: string | null;
  response_root_path: string | null;
  external_id_field: string | null;
  updated_at_field: string | null;
  updated_since_param: string | null;
  page_param: string | null;
  page_size_param: string | null;
  page_size: number;
  auto_sync_enabled: boolean;
  sync_frequency_minutes: number | null;
  credentials_configured: boolean;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_safe: string | null;
  next_sync_at: string | null;
  last_cursor: string | null;
  detected_fields: string[];
  sample_preview: Record<string, unknown>[];
  sample_http_status: number | null;
};
export type ApiSyncRun = {
  id: string;
  status: string;
  sync_type: string;
  created_at: string;
  received_count: number;
  accepted_count: number;
  rejected_count: number;
  unchanged_count: number;
  staging_batch_id: string | null;
  error_message_safe: string | null;
  normalization_status: string | null;
  latest_normalization_run_id: string | null;
  latest_normalization_status: string | null;
  latest_normalization_created_count: number;
  latest_normalization_updated_count: number;
  latest_normalization_skipped_count: number;
  latest_normalization_error_count: number;
  latest_normalization_finished_at: string | null;
  latest_normalization_error_code: string | null;
  latest_normalization_error_message: string | null;
  latest_normalization_error_is_stale?: boolean;
  published_current_count: number;
  not_published_count: number;
  processed_successfully: boolean;
  needs_revalidation: boolean;
  has_processable_records: boolean;
  errors: Array<{
    id: string;
    row_number: number | null;
    field: string | null;
    error_code: string;
    message: string;
    raw_value: string | null;
  }>;
};
const route = (t: string, s: string) => `/tenants/${t}/integrations/${s}`;
export const getApiConfig = (t: string, s: string) =>
  call<ApiConnectorConfig | null>(`${route(t, s)}/api-config`);
export const saveApiConfig = (
  t: string,
  s: string,
  p: Record<string, unknown>,
) =>
  call<ApiConnectorConfig>(`${route(t, s)}/api-config`, {
    method: 'PUT',
    body: JSON.stringify(p),
  });
export const testApi = (t: string, s: string) =>
  call<{
    ok: boolean;
    http_status: number;
    record_count: number;
    fields: string[];
    sample: Record<string, unknown>[];
  }>(`${route(t, s)}/api-test`, { method: 'POST' });
export const useApiSample = (t: string, s: string) =>
  call<{
    fields: string[];
    sample: Record<string, unknown>[];
    http_status: number;
  }>(`${route(t, s)}/api-sample`, { method: 'POST' });
export const syncApiNow = (t: string, s: string) =>
  call<{
    staging_batch_id: string;
    received_count: number;
    accepted_count: number;
    rejected_count: number;
    unchanged_count: number;
  }>(`${route(t, s)}/api-sync-now`, { method: 'POST' });
export const listApiRuns = (t: string, s: string) =>
  call<ApiSyncRun[]>(`${route(t, s)}/api-sync-runs`);
export const revalidateApiBatch = (t: string, s: string, batchId: string) =>
  call<{
    staging_batch_id: string;
    status: string;
    accepted_count: number;
    rejected_count: number;
    error_count: number;
  }>(`${route(t, s)}/staging-batches/${batchId}/revalidate-current-rules`, {
    method: 'POST',
  });
export type ReprocessBatchResult = {processed_records:number;created_records:number;updated_records:number;ignored_records:number;error_records:number;published_records:number;not_published_records:number};
export const reprocessApiBatch = (t:string,s:string,batchId:string) => call<ReprocessBatchResult>(`${route(t,s)}/staging-batches/${batchId}/reprocess`, {method:'POST'});
export type ApiFieldMapping = {
  id: string;
  api_source_field_name: string;
  data_contract_field_id: string;
  canonical_entity_id?: string | null;
  canonical_field_id?: string | null;
  canonical_entity_key?: string | null;
  canonical_field_key?: string | null;
  canonical_entity_name?: string | null;
  canonical_field_name?: string | null;
  label?: string | null;
  canonical_label?: string | null;
  data_contract_field?: { field_key: string; data_type: string } | null;
};
export const listApiFieldMappings = (t: string, s: string) =>
  call<ApiFieldMapping[]>(`${route(t, s)}/api-field-mappings`);
export type PrimaryLogisticKey='delivery_number'|'document_number'|'invoice_number'|'cte_number'|'manifest_number'|'order_number';
export type TenantLogisticKeySetting={tenant_id:string;primary_logistic_key:PrimaryLogisticKey;established_by_data_source_id:string|null;established_at:string};
const primaryLogisticKeys:PrimaryLogisticKey[]=['delivery_number','document_number','invoice_number','cte_number','manifest_number','order_number'];
export const isTenantLogisticKeySetting=(value:unknown):value is TenantLogisticKeySetting=>{
  if(!value||Array.isArray(value)||typeof value!=='object')return false;
  return primaryLogisticKeys.includes((value as Partial<TenantLogisticKeySetting>).primary_logistic_key as PrimaryLogisticKey);
};
export const getPrimaryLogisticKey=async(t:string,s:string):Promise<TenantLogisticKeySetting|null>=>{
  const response=await call<TenantLogisticKeySetting|null|TenantLogisticKeySetting[]>(`${route(t,s)}/primary-logistic-key`);
  return isTenantLogisticKeySetting(response)?response:null;
};
export type IgnoredApiField = {
  source_field_name: string;
  data_contract_field_id: string;
  ignored_at: string | null;
};
export const listIgnoredApiFields = (t: string, s: string) =>
  call<IgnoredApiField[]>(`${route(t, s)}/ignored-api-fields`);
export const saveApiFieldMappings = (
  t: string,
  s: string,
  mappings: Array<{
    source_field_name: string;
    data_contract_field_id: string;
    canonical_entity_id?: string;
    canonical_field_id?: string;
  }>, primary_logistic_key?:PrimaryLogisticKey,
) =>
  call<ApiFieldMapping[]>(`${route(t, s)}/api-field-mappings`, {
    method: 'PUT',
    body: JSON.stringify({ mappings, primary_logistic_key }),
  });
export type ValueMappingItem = {
  source_field_name: string;
  data_contract_field_id: string;
  field_key: string;
  is_required: boolean;
  canonical_label?: string | null;
  source_value: string;
  target_value: string | null;
  allowed_values: string[];
  status: 'mapped' | 'pending' | 'exact_match' | 'ignored_value';
};
export const listValueMappings = (t: string, s: string) =>
  call<ValueMappingItem[]>(`${route(t, s)}/value-mappings`);
export const saveValueMappings = (
  t: string,
  s: string,
  mappings: Array<{
    source_field_name: string;
    data_contract_field_id: string;
    source_value: string;
    target_value: string | null;
    decision?: 'mapped' | 'ignored_value' | 'ignored_field';
  }>,
) =>
  call<ValueMappingItem[]>(`${route(t, s)}/value-mappings`, {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
export type FieldParseRule = {
  id?: string;
  source_field_name: string;
  data_contract_field_id: string;
  field_key?: string;
  data_type: string;
  date_format: string | null;
  timezone: string | null;
  decimal_separator: string | null;
  thousand_separator: string | null;
  boolean_true_values: string[] | null;
  boolean_false_values: string[] | null;
  status?: string;
};
const legacyDateFormats: Record<string, string> = {
  'YYYY-MM-DD': 'yyyy_mm_dd',
  'YYYY-MM-DD HH:mm:ss': 'yyyy_mm_dd_hh_mm_ss',
  'YYYY-MM-DDTHH:mm:ss': 'yyyy_mm_dd_t_hh_mm_ss',
  'DD/MM/YYYY': 'dd_mm_yyyy',
  'DD/MM/YYYY HH:mm:ss': 'dd_mm_yyyy_hh_mm_ss',
};
export const normalizeFieldParseRule = (rule: FieldParseRule) => ({
  ...rule,
  date_format: rule.date_format
    ? (legacyDateFormats[rule.date_format] ?? rule.date_format)
    : null,
});
export const listFieldParseRules = (t: string, s: string) =>
  call<FieldParseRule[]>(`${route(t, s)}/field-parse-rules`);
export const saveFieldParseRules = (
  t: string,
  s: string,
  rules: FieldParseRule[],
) =>
  call<FieldParseRule[]>(`${route(t, s)}/field-parse-rules`, {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  });
