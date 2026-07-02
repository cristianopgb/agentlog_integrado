import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [SupabaseModule],
  providers: [AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
