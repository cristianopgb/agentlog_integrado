import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get('me')
  async getMe(@Req() request: AuthenticatedRequest) {
    const profiles = await this.supabase.select<Array<{ id: string; full_name: string | null; active_tenant_id: string | null }>>(
      'users_profile',
      `select=id,full_name,active_tenant_id,created_at,updated_at&id=eq.${request.user.id}`,
    );
    return { authUser: request.user, profile: profiles[0] ?? null };
  }
}
