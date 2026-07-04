import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { PlansController } from './plans.controller';

@Module({
  imports: [SupabaseModule, RbacModule],
  controllers: [PlansController],
})
export class PlansModule {}
