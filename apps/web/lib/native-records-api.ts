const tokenKey = 'sli_supabase_access_token';
function getApiBase() { const configured = process.env.NEXT_PUBLIC_API_URL; if (configured) return configured.replace(/\/$/, ''); if (process.env.NODE_ENV === 'production') throw new Error('API backend não configurada. Defina NEXT_PUBLIC_API_URL no ambiente.'); return 'http://localhost:3001'; }
async function api<T>(path: string): Promise<T> { const token = window.localStorage.getItem(tokenKey); const response = await fetch(`${getApiBase()}${path}`, { headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } }); const text = await response.text(); const body = text ? JSON.parse(text) as unknown : null; if (!response.ok) throw new Error(typeof body === 'object' && body && 'message' in body ? String((body as { message: unknown }).message) : 'Falha ao carregar dados tratados.'); return body as T; }
export type NativeRecord = Record<string, string | number | boolean | null> & { id: string; updated_at: string | null; data_quality_status: string | null };
export type NativeRecordList = { data: NativeRecord[]; pagination: { limit: number; offset: number; count: number }; summary: { total: number; complete: number; partial: number; lastNormalization: string | null } };
export type NativeExtensions = Record<string, Array<Record<string, unknown>>>;
export type NativeEvent = { id: string; event_type: string | null; event_title: string | null; event_description: string | null; occurred_at: string | null; source_system: string | null };
export function listNativeRecords(tenantId: string, params: URLSearchParams) { return api<NativeRecordList>(`/tenants/${tenantId}/native-records?${params.toString()}`); }
export function getNativeRecord(tenantId: string, id: string) { return api<NativeRecord>(`/tenants/${tenantId}/native-records/${id}`); }
export function getNativeRecordEvents(tenantId: string, id: string) { return api<NativeEvent[]>(`/tenants/${tenantId}/native-records/${id}/events`); }
export function getNativeRecordExtensions(tenantId: string, id: string) { return api<NativeExtensions>(`/tenants/${tenantId}/native-records/${id}/extensions`); }
