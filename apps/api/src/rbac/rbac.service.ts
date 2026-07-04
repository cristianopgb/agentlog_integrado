import { ForbiddenException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class RbacService {
  constructor(private readonly supabase: SupabaseService) {}

  async ensureTenantMembership(userId: string, tenantId: string) {
    const membership = await this.getUserRoleIds(userId, tenantId);
    if (!membership.length) throw new ForbiddenException('User is not a member of this tenant.');
    return membership;
  }

  async getUserRoleIds(userId: string, tenantId: string) {
    const rows = await this.supabase.select<Array<{ role_id: string }>>('user_roles', `select=role_id&user_id=eq.${userId}&tenant_id=eq.${tenantId}`);
    return rows.map((row) => row.role_id);
  }

  async userHasPermission(userId: string, tenantId: string, permissionKey: string) {
    const roleIds = await this.getUserRoleIds(userId, tenantId);
    if (!roleIds.length) return false;
    const rows = await this.supabase.select<Array<{ id: string }>>(
      'role_permissions',
      `select=id,permission:permissions!inner(key)&tenant_id=eq.${tenantId}&role_id=in.(${roleIds.join(',')})&permission.key=eq.${permissionKey}&limit=1`,
    );
    return rows.length > 0;
  }

  async ensurePermission(userId: string, tenantId: string, permissionKeys: string[], mode: 'any' | 'all' = 'any') {
    await this.ensureTenantMembership(userId, tenantId);
    const checks = await Promise.all(permissionKeys.map((permissionKey) => this.userHasPermission(userId, tenantId, permissionKey)));
    const allowed = mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
    if (!allowed) throw new ForbiddenException('User does not have permission for this resource.');
  }
}
