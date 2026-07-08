import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ModulesController } from './modules/modules.controller';
import { PlansModule } from './plans/plans.module';
import { RbacController } from './rbac/rbac.controller';
import { RbacModule } from './rbac/rbac.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SetupModule } from './setup/setup.module';
import { DataContractsModule } from './data-contracts/data-contracts.module';
import { StagingModule } from './staging/staging.module';
import { CanonicalModule } from './canonical/canonical.module';
import { NormalizationModule } from './normalization/normalization.module';
import { NativeRecordsModule } from './native-records/native-records.module';
import { NativeIndicatorsModule } from './native-indicators/native-indicators.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TenantsController } from './tenants/tenants.controller';
import { UsageModule } from './usage/usage.module';
import { UsersController } from './users/users.controller';

@Module({
  imports: [SupabaseModule, AuthModule, RbacModule, PlansModule, SubscriptionsModule, UsageModule, SetupModule, DataContractsModule, StagingModule, CanonicalModule, NormalizationModule, NativeRecordsModule, NativeIndicatorsModule],
  controllers: [HealthController, UsersController, TenantsController, ModulesController, RbacController],
})
export class AppModule {}
