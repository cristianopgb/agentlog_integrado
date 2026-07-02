import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { ModulesController } from './modules/modules.controller';
import { SupabaseModule } from './supabase/supabase.module';
import { TenantsController } from './tenants/tenants.controller';
import { UsersController } from './users/users.controller';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [HealthController, UsersController, TenantsController, ModulesController],
})
export class AppModule {}
