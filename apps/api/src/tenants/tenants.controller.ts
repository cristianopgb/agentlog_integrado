import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants')
@UseGuards(AuthGuard, PermissionsGuard)
export class TenantsController {
  constructor(private readonly supabase: SupabaseService, private readonly rbac: RbacService) {}

  @Get()
  async listTenants(@Req() request: AuthenticatedRequest) {
    const rows = await this.supabase.select<Array<{ tenant: { id: string } }>>(
      'user_roles',
      `select=tenant:tenants(id,name,slug,created_at,updated_at)&user_id=eq.${request.user.id}`,
    );
    const tenants = rows.map((row) => row.tenant).filter(Boolean);
    const allowed = await Promise.all(tenants.map(async (tenant) => ((await this.rbac.userHasPermission(request.user.id, tenant.id, 'core.tenants.view')) ? tenant : null)));
    return allowed.filter(Boolean);
  }

  @Get(':tenantId/modules')
  @RequirePermission(['core.modules.view', 'commercial.modules.view'])
  async listTenantModules(@Param('tenantId') tenantId: string) {
    return this.supabase.select(
      'tenant_modules',
      `select=id,tenant_id,is_active,module:modules(id,key,name,is_active)&tenant_id=eq.${tenantId}&is_active=eq.true`,
    );
  }
}
