import { createBrowserSupabaseClient } from './supabase';

export type SetupProject = { id: string; tenant_id: string; name: string; description: string | null; status: string; priority: string; target_date: string | null; progress_percent: number; started_at: string | null; completed_at: string | null };
export type SetupStep = { id: string; setup_project_id: string; key: string; title: string; description: string | null; status: string; sort_order: number };
export type SetupChecklistItem = { id: string; setup_project_id: string; setup_step_id: string | null; title: string; description: string | null; status: string; is_required: boolean; sort_order: number };

export async function getSessionContext() {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const token = window.localStorage.getItem('sli_supabase_access_token');
  if (!data.user || !token) return { user: null, token: null, tenantId: null };
  const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
  return { user: data.user, token, tenantId: (profile as { active_tenant_id: string | null } | null)?.active_tenant_id ?? null };
}

export async function setupApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (response.status === 403) throw new Error('Acesso negado para a permissão solicitada.');
  if (!response.ok) throw new Error('Não foi possível carregar os dados de setup.');
  return (await response.json()) as T;
}
