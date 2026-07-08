import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { NativeRecordsController } from './native-records.controller';
import { NativeRecordsService } from './native-records.service';

@Module({ imports: [SupabaseModule, RbacModule], controllers: [NativeRecordsController], providers: [NativeRecordsService] })
export class NativeRecordsModule {}
