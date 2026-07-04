import { Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('tenants/:tenantId/usage')
@UseGuards(AuthGuard)
export class UsageController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async listUsage(@Req() request: AuthenticatedRequest, @Param('tenantId') tenantId: string) {
    await this.ensureMembership(request.user.id, tenantId);
    return this.supabase.select(
      'usage_records',
      `select=id,tenant_id,subscription_id,metric_key,quantity,unit,recorded_at,metadata,created_at&tenant_id=eq.${tenantId}&order=recorded_at.desc&limit=100`,
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
