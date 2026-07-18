import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { NativeIndicatorsModule } from '../native-indicators/native-indicators.module';
import { CustomIndicatorsModule } from '../custom-indicators/custom-indicators.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({ imports: [SupabaseModule, NativeIndicatorsModule, CustomIndicatorsModule], controllers: [DashboardsController], providers: [DashboardsService] })
export class DashboardsModule {}
