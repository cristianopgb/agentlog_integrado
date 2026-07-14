import { createBrowserSupabaseClient } from './supabase';

function getApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production')
    throw new Error(
      'API backend não configurada. Defina NEXT_PUBLIC_API_URL no ambiente.',
    );
  return 'http://localhost:3001';
}
const tokenKey = 'sli_supabase_access_token';

export type NormalizationRun = {
  id: string;
  tenant_id: string;
  staging_batch_id: string;
  status: string;
  total_records: number;
  processed_records: number;
  created_operation_records: number;
  updated_operation_records: number;
  created_extension_records: number;
  updated_extension_records: number;
  error_records: number;
  error_summary: Record<string, number>;
  created_at: string;
  finished_at: string | null;
  normalization_errors?: NormalizationError[];
};
export type NormalizationError = {
  id: string;
  error_code: string;
  error_message: string;
  canonical_entity_key: string | null;
  canonical_field_key: string | null;
  staging_record_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

async function api(path: string, init?: RequestInit) {
  const token = window.localStorage.getItem(tokenKey);
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? tryParseJson(text) : null;
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'message' in body
        ? Array.isArray(body.message)
          ? body.message.join(' ')
          : String(body.message)
        : text;
    throw new Error(sanitizeApiError(message || 'API request failed.'));
  }
  return body;
}

function sanitizeApiError(message: string) {
  const technicalFragments = [
    'constraint',
    'failing row',
    'violates check',
    'operation_records_document_type_check',
    'stack',
  ];
  const lower = message.toLowerCase();
  if (technicalFragments.some((fragment) => lower.includes(fragment))) {
    return 'Não foi possível processar o lote porque alguns valores não seguem o padrão esperado da base nativa.';
  }
  return message;
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function processNormalization(tenantId: string, batchId: string) {
  return api(`/tenants/${tenantId}/staging-batches/${batchId}/normalize`, {
    method: 'POST',
  }) as Promise<NormalizationRun>;
}
export async function listNormalizationRuns(tenantId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('normalization_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as NormalizationRun[];
}
export async function listNormalizationErrors(tenantId: string, runId: string) {
  const { data, error } = await createBrowserSupabaseClient()
    .from('normalization_errors')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('normalization_run_id', runId)
    .order('created_at');
  if (error) throw error;
  return data as NormalizationError[];
}
