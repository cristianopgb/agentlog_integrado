import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants/:tenantId/usage')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission('commercial.usage.view')
export class UsageController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async listUsage(@Param('tenantId') tenantId: string) {
    return this.supabase.select(
      'usage_records',
      `select=id,tenant_id,subscription_id,metric_key,quantity,unit,recorded_at,metadata,created_at&tenant_id=eq.${tenantId}&order=recorded_at.desc&limit=100`,
    );
  }
}
