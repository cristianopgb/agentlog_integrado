import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { CanonicalEntitiesController } from './canonical-entities.controller';
import { CanonicalFieldsController } from './canonical-fields.controller';
import { FieldMappingsController } from './field-mappings.controller';
import { MappingService } from './mapping.service';
import { NativeSchemaController } from './native-schema.controller';
import { RulesController } from './rules.controller';

@Module({ imports: [SupabaseModule, RbacModule], controllers: [CanonicalEntitiesController, CanonicalFieldsController, FieldMappingsController, RulesController, NativeSchemaController], providers: [MappingService] })
export class CanonicalModule {}
