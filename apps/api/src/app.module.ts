import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ModulesController } from './modules/modules.controller';
import { PlansModule } from './plans/plans.module';
import { RbacController } from './rbac/rbac.controller';
import { RbacModule } from './rbac/rbac.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SetupModule } from './setup/setup.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TenantsController } from './tenants/tenants.controller';
import { UsageModule } from './usage/usage.module';
import { UsersController } from './users/users.controller';

@Module({
  imports: [SupabaseModule, AuthModule, RbacModule, PlansModule, SubscriptionsModule, UsageModule, SetupModule],
  controllers: [HealthController, UsersController, TenantsController, ModulesController, RbacController],
})
export class AppModule {}
