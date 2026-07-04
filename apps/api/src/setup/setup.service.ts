import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

const projectFields = 'id,tenant_id,name,description,status,priority,owner_user_id,started_at,target_date,completed_at,progress_percent,created_at,updated_at,created_by,updated_by';
const stepFields = 'id,tenant_id,setup_project_id,key,title,description,status,sort_order,owner_user_id,started_at,completed_at,created_at,updated_at';
const checklistFields = 'id,tenant_id,setup_project_id,setup_step_id,title,description,status,is_required,sort_order,completed_at,completed_by,created_at,updated_at';

@Injectable()
export class SetupService {
  constructor(private readonly supabase: SupabaseService) {}

  listProjects(tenantId: string) { return this.supabase.select('setup_projects', `select=${projectFields}&tenant_id=eq.${tenantId}&order=created_at.desc`); }
  async getProject(tenantId: string, projectId: string) {
    const rows = await this.supabase.select<Array<unknown>>('setup_projects', `select=${projectFields}&tenant_id=eq.${tenantId}&id=eq.${projectId}&limit=1`);
    if (!rows.length) throw new NotFoundException('Setup project not found.');
    return rows[0];
  }
  createProject(tenantId: string, userId: string, body: Record<string, unknown>) {
    const payload = this.pick(body, ['name','description','status','priority','owner_user_id','started_at','target_date','completed_at','progress_percent']);
    if (!payload.name) throw new BadRequestException('Project name is required.');
    return this.supabase.insert('setup_projects', { ...payload, tenant_id: tenantId, created_by: userId, updated_by: userId });
  }
  updateProject(tenantId: string, projectId: string, userId: string, body: Record<string, unknown>) {
    const payload = this.pick(body, ['name','description','status','priority','owner_user_id','started_at','target_date','completed_at','progress_percent']);
    return this.supabase.update('setup_projects', `tenant_id=eq.${tenantId}&id=eq.${projectId}`, { ...payload, updated_by: userId });
  }
  listSteps(tenantId: string, projectId: string) { return this.supabase.select('setup_steps', `select=${stepFields}&tenant_id=eq.${tenantId}&setup_project_id=eq.${projectId}&order=sort_order.asc`); }
  updateStep(tenantId: string, stepId: string, body: Record<string, unknown>) {
    const payload = this.pick(body, ['title','description','status','sort_order','owner_user_id','started_at','completed_at']);
    return this.supabase.update('setup_steps', `tenant_id=eq.${tenantId}&id=eq.${stepId}`, payload);
  }
  listChecklist(tenantId: string, projectId: string) { return this.supabase.select('setup_checklist_items', `select=${checklistFields}&tenant_id=eq.${tenantId}&setup_project_id=eq.${projectId}&order=sort_order.asc`); }
  updateChecklistItem(tenantId: string, itemId: string, userId: string, body: Record<string, unknown>) {
    const payload = this.pick(body, ['title','description','status','is_required','sort_order','completed_at']);
    if (payload.status === 'done' && !payload.completed_at) payload.completed_at = new Date().toISOString();
    if (payload.status === 'done') payload.completed_by = userId;
    return this.supabase.update('setup_checklist_items', `tenant_id=eq.${tenantId}&id=eq.${itemId}`, payload);
  }
  private pick(body: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])); }
}
