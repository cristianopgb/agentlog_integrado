import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { RbacService } from '../rbac/rbac.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly supabase: SupabaseService, private readonly rbac: RbacService) {}

  @Get()
  async listPlans(@Req() request: AuthenticatedRequest) {
    const roles = await this.supabase.select<Array<{ tenant_id: string }>>('user_roles', `select=tenant_id&user_id=eq.${request.user.id}`);
    const checks = await Promise.all(roles.map((role) => this.rbac.userHasPermission(request.user.id, role.tenant_id, 'commercial.plans.view')));
    if (!checks.some(Boolean)) return [];
    return this.supabase.select(
      'plans',
      'select=id,key,name,description,status,monthly_price_cents,annual_price_cents,currency,sort_order&status=eq.active&order=sort_order.asc',
    );
  }

  @Get(':planId/modules')
  async listPlanModules(@Param('planId') planId: string) {
    return this.supabase.select(
      'plan_modules',
      `select=id,is_included,module:modules(id,key,name,is_active),plan:plans(id,key,name,status)&plan_id=eq.${planId}&is_included=eq.true`,
    );
  }
}
