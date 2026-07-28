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
  if (!response.ok)
    throw new Error(
      (body as { message?: string }).message ?? 'Falha na integração API.',
    );
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
export type ApiFieldMapping = {
  id: string;
  api_source_field_name: string;
  data_contract_field_id: string;
};
export const listApiFieldMappings = (t: string, s: string) =>
  call<ApiFieldMapping[]>(`${route(t, s)}/api-field-mappings`);
export const saveApiFieldMappings = (
  t: string,
  s: string,
  mappings: Array<{
    source_field_name: string;
    data_contract_field_id: string;
  }>,
) =>
  call<ApiFieldMapping[]>(`${route(t, s)}/api-field-mappings`, {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
export type ValueMappingItem = {
  source_field_name: string;
  data_contract_field_id: string;
  field_key: string;
  source_value: string;
  target_value: string | null;
  allowed_values: string[];
  status: 'mapped' | 'pending' | 'exact_match';
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
