import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { NormalizationController } from './normalization.controller';
import { NormalizationService } from './normalization.service';

@Module({ imports: [SupabaseModule, RbacModule], controllers: [NormalizationController], providers: [NormalizationService] })
export class NormalizationModule {}
