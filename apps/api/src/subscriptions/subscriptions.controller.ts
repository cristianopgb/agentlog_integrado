import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants/:tenantId/subscription')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission('commercial.subscription.view')
export class SubscriptionsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async getSubscription(@Param('tenantId') tenantId: string) {
    const rows = await this.supabase.select(
      'subscriptions',
      `select=id,tenant_id,status,started_at,trial_ends_at,current_period_start,current_period_end,cancelled_at,plan:plans(id,key,name,description,monthly_price_cents,annual_price_cents,currency)&tenant_id=eq.${tenantId}&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }

  @Get('limits')
  async listLimits(@Param('tenantId') tenantId: string) {
    return this.supabase.select(
      'subscription_limits',
      `select=id,tenant_id,subscription_id,key,name,limit_value,unit&tenant_id=eq.${tenantId}&order=key.asc`,
    );
  }
}
