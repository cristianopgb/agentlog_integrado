import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants/:tenantId/subscription')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async getSubscription(@Req() request: AuthenticatedRequest, @Param('tenantId') tenantId: string) {
    await this.ensureMembership(request.user.id, tenantId);
    const rows = await this.supabase.select(
      'subscriptions',
      `select=id,tenant_id,status,started_at,trial_ends_at,current_period_start,current_period_end,cancelled_at,plan:plans(id,key,name,description,monthly_price_cents,annual_price_cents,currency)&tenant_id=eq.${tenantId}&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  }

  @Get('limits')
  async listLimits(@Req() request: AuthenticatedRequest, @Param('tenantId') tenantId: string) {
    await this.ensureMembership(request.user.id, tenantId);
    return this.supabase.select(
      'subscription_limits',
      `select=id,tenant_id,subscription_id,key,name,limit_value,unit&tenant_id=eq.${tenantId}&order=key.asc`,
    );
  }

  private async ensureMembership(userId: string, tenantId: string) {
    const membership = await this.supabase.select<Array<{ id: string }>>(
      'user_roles',
      `select=id&user_id=eq.${userId}&tenant_id=eq.${tenantId}&limit=1`,
    );
    if (!membership.length) throw new ForbiddenException('User is not a member of this tenant.');
  }
}
