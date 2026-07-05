import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DataContractFieldsController } from './data-contract-fields.controller';
import { DataContractsController } from './data-contracts.controller';
import { DataContractsService } from './data-contracts.service';
import { DataSourcesController } from './data-sources.controller';
@Module({ imports: [SupabaseModule, RbacModule], controllers: [DataSourcesController, DataContractsController, DataContractFieldsController], providers: [DataContractsService] })
export class DataContractsModule {}
