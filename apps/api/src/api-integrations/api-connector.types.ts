export type ApiAuthType = 'none' | 'bearer_token' | 'api_key_header' | 'basic';
export type ApiConfig = {
  id: string; tenant_id: string; data_source_id: string; base_url: string; endpoint_path: string; method: 'GET';
  auth_type: ApiAuthType; auth_header_name: string | null; credentials_encrypted: string | null; response_root_path: string | null;
  external_id_field: string | null; updated_at_field: string | null; updated_since_param: string | null; page_param: string | null;
  page_size_param: string | null; page_size: number; auto_sync_enabled: boolean; sync_frequency_minutes: number | null;
  last_cursor: string | null; last_sync_at: string | null; last_success_at: string | null; last_failure_at: string | null;
  last_error_safe: string | null; next_sync_at: string | null;
  detected_fields: string[]; sample_preview: Record<string, unknown>[]; sample_http_status: number | null;
};
