import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { CustomIndicatorsController } from './custom-indicators.controller';
import { CustomIndicatorsService } from './custom-indicators.service';
@Module({ imports:[SupabaseModule,RbacModule], controllers:[CustomIndicatorsController], providers:[CustomIndicatorsService] })
export class CustomIndicatorsModule {}
