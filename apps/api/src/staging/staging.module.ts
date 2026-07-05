import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { StagingBatchesController } from './staging-batches.controller';
import { StagingErrorsController } from './staging-errors.controller';
import { StagingRecordsController } from './staging-records.controller';
import { StagingService } from './staging.service';
@Module({ imports: [SupabaseModule, RbacModule], controllers: [StagingBatchesController, StagingRecordsController, StagingErrorsController], providers: [StagingService] })
export class StagingModule {}
