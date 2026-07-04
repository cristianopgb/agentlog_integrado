import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('plans')
@UseGuards(AuthGuard)
export class PlansController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async listPlans() {
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
