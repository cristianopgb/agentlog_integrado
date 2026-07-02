import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants')
@UseGuards(AuthGuard)
export class TenantsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async listTenants(@Req() request: AuthenticatedRequest) {
    const rows = await this.supabase.select<Array<{ tenant: unknown }>>(
      'user_roles',
      `select=tenant:tenants(id,name,slug,created_at,updated_at)&user_id=eq.${request.user.id}`,
    );
    return rows.map((row) => row.tenant).filter(Boolean);
  }

  @Get(':tenantId/modules')
  async listTenantModules(@Req() request: AuthenticatedRequest, @Param('tenantId') tenantId: string) {
    const membership = await this.supabase.select<Array<{ id: string }>>(
      'user_roles',
      `select=id&user_id=eq.${request.user.id}&tenant_id=eq.${tenantId}&limit=1`,
    );
    if (!membership.length) throw new ForbiddenException('User is not a member of this tenant.');

    return this.supabase.select(
      'tenant_modules',
      `select=id,tenant_id,is_active,module:modules(id,key,name,is_active)&tenant_id=eq.${tenantId}&is_active=eq.true`,
    );
  }
}
