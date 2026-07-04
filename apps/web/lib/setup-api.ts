import { createBrowserSupabaseClient } from './supabase';

export type SetupProject = { id: string; tenant_id: string; name: string; description: string | null; status: string; priority: string; target_date: string | null; progress_percent: number; started_at: string | null; completed_at: string | null };
export type SetupStep = { id: string; tenant_id: string; setup_project_id: string; key: string; title: string; description: string | null; status: string; sort_order: number };
export type SetupChecklistItem = { id: string; tenant_id: string; setup_project_id: string; setup_step_id: string | null; title: string; description: string | null; status: string; is_required: boolean; sort_order: number };

export async function getSessionContext() {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { user: null, tenantId: null };
  const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
  return { user: data.user, tenantId: (profile as { active_tenant_id: string | null } | null)?.active_tenant_id ?? null };
}

export async function listSetupProjects(tenantId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase
    .from('setup_projects')
    .select('id,tenant_id,name,description,status,priority,target_date,progress_percent,started_at,completed_at')
    .eq('tenant_id', tenantId)
    .order('status')
    .order('name');
  return data as SetupProject[];
}

export async function getSetupProject(tenantId: string, projectId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase
    .from('setup_projects')
    .select('id,tenant_id,name,description,status,priority,target_date,progress_percent,started_at,completed_at')
    .eq('tenant_id', tenantId)
    .eq('id', projectId)
    .maybeSingle();
  return data as SetupProject | null;
}

export async function listSetupSteps(tenantId: string, projectId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase
    .from('setup_steps')
    .select('id,tenant_id,setup_project_id,key,title,description,status,sort_order')
    .eq('tenant_id', tenantId)
    .eq('setup_project_id', projectId)
    .order('sort_order');
  return data as SetupStep[];
}

export async function listSetupChecklistItems(tenantId: string, projectId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase
    .from('setup_checklist_items')
    .select('id,tenant_id,setup_project_id,setup_step_id,title,description,status,is_required,sort_order')
    .eq('tenant_id', tenantId)
    .eq('setup_project_id', projectId)
    .order('sort_order');
  return data as SetupChecklistItem[];
}

export async function updateSetupProjectStatus(tenantId: string, projectId: string, status: string) {
  const supabase = createBrowserSupabaseClient();
  await supabase.from('setup_projects').update({ status }).eq('tenant_id', tenantId).eq('id', projectId);
}

export async function updateSetupStepStatus(tenantId: string, stepId: string, status: string) {
  const supabase = createBrowserSupabaseClient();
  await supabase.from('setup_steps').update({ status }).eq('tenant_id', tenantId).eq('id', stepId);
}

export async function updateSetupChecklistItemStatus(tenantId: string, itemId: string, status: string) {
  const supabase = createBrowserSupabaseClient();
  await supabase.from('setup_checklist_items').update({ status }).eq('tenant_id', tenantId).eq('id', itemId);
}
