import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [SupabaseModule, RbacModule],
  controllers: [SubscriptionsController],
})
export class SubscriptionsModule {}
