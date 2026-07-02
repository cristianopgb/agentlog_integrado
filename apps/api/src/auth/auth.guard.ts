import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

export type AuthenticatedRequest = Request & { user: { id: string; email?: string } };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.supabase.getUserFromBearerToken(request.headers.authorization);

    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    request.user = { id: user.id, email: user.email };
    return true;
  }
}
