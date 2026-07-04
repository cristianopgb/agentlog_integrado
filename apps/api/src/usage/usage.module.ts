import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { UsageController } from './usage.controller';

@Module({
  imports: [SupabaseModule, RbacModule],
  controllers: [UsageController],
})
export class UsageModule {}
