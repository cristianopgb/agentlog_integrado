import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('modules')
@UseGuards(AuthGuard)
export class ModulesController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  async listModules() {
    return this.supabase.select('modules', 'select=id,key,name,is_active&is_active=eq.true&order=name.asc');
  }
}
