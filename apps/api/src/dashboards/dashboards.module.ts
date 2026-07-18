import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { NativeIndicatorsModule } from '../native-indicators/native-indicators.module';
import { CustomIndicatorsModule } from '../custom-indicators/custom-indicators.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [
    AuthModule,
    RbacModule,
    SupabaseModule,
    NativeIndicatorsModule,
    CustomIndicatorsModule,
  ],
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
