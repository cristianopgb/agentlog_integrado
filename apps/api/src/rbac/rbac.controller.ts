import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';
import { RequirePermission } from './require-permission.decorator';

@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly supabase: SupabaseService, private readonly rbac: RbacService) {}

  @Get('permissions')
  async listPermissions() {
    return this.supabase.select('permissions', 'select=id,key,name,module_key,resource,action,description&order=module_key.asc,resource.asc,action.asc');
  }

  @Get('tenants/:tenantId/roles')
  @RequirePermission('core.roles.view')
  async listRoles(@Param('tenantId') tenantId: string) {
    return this.supabase.select('roles', `select=id,tenant_id,key,name,role_permissions(count)&tenant_id=eq.${tenantId}&order=name.asc`);
  }

  @Get('tenants/:tenantId/roles/:roleId/permissions')
  @RequirePermission('core.permissions.view')
  async listRolePermissions(@Param('tenantId') tenantId: string, @Param('roleId') roleId: string) {
    return this.supabase.select('role_permissions', `select=id,tenant_id,role_id,permission:permissions(id,key,name,module_key,resource,action,description)&tenant_id=eq.${tenantId}&role_id=eq.${roleId}`);
  }

  @Get('tenants/:tenantId/me/permissions')
  async listMyPermissions(@Req() request: AuthenticatedRequest, @Param('tenantId') tenantId: string) {
    const roleIds = await this.rbac.ensureTenantMembership(request.user.id, tenantId);
    if (!roleIds.length) return [];
    const rows = await this.supabase.select<Array<{ permission: unknown }>>(
      'role_permissions',
      `select=permission:permissions(id,key,name,module_key,resource,action,description)&tenant_id=eq.${tenantId}&role_id=in.(${roleIds.join(',')})`,
    );
    return rows.map((row) => row.permission);
  }
}
