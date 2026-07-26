import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApiConnectorConfigService } from './api-connector-config.service';
import { ApiConnectorSyncService } from './api-connector-sync.service';
import { ApiIntegrationsController, ApiIntegrationsInternalController } from './api-integrations.controller';
@Module({imports:[SupabaseModule,RbacModule],controllers:[ApiIntegrationsController,ApiIntegrationsInternalController],providers:[ApiConnectorConfigService,ApiConnectorSyncService]}) export class ApiIntegrationsModule {}
