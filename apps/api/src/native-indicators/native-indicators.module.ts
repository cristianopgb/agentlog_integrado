import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { NativeIndicatorsController } from './native-indicators.controller';
import { NativeIndicatorsService } from './native-indicators.service';

@Module({ imports: [SupabaseModule, RbacModule], controllers: [NativeIndicatorsController], providers: [NativeIndicatorsService], exports: [NativeIndicatorsService] })
export class NativeIndicatorsModule {}
