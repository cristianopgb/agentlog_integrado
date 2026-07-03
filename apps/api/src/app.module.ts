import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ModulesController } from './modules/modules.controller';
import { PlansModule } from './plans/plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TenantsController } from './tenants/tenants.controller';
import { UsageModule } from './usage/usage.module';
import { UsersController } from './users/users.controller';

@Module({
  imports: [SupabaseModule, AuthModule, PlansModule, SubscriptionsModule, UsageModule],
  controllers: [HealthController, UsersController, TenantsController, ModulesController],
})
export class AppModule {}
