import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { SetupChecklistController } from './setup-checklist.controller';
import { SetupProjectsController } from './setup-projects.controller';
import { SetupStepsController } from './setup-steps.controller';
import { SetupService } from './setup.service';
@Module({ imports: [SupabaseModule, RbacModule], controllers: [SetupProjectsController, SetupStepsController, SetupChecklistController], providers: [SetupService] })
export class SetupModule {}
