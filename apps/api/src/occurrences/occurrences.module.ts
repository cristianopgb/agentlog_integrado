import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { OccurrencesController } from './occurrences.controller';
import { OccurrencesService } from './occurrences.service';

@Module({ imports: [SupabaseModule, RbacModule], controllers: [OccurrencesController], providers: [OccurrencesService] })
export class OccurrencesModule {}
