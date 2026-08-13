import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ApiConnectorConfigService } from './api-connector-config.service';
import { ApiConnectorSyncService } from './api-connector-sync.service';
import {
  ApiIntegrationsController,
  ApiIntegrationsInternalController,
} from './api-integrations.controller';
import { ValueMappingsService } from './value-mappings.service';
import { FieldParseRulesService } from './field-parse-rules.service';
import { CanonicalValueDomainsService } from '../canonical/canonical-value-domains.service';
import { NormalizationModule } from '../normalization/normalization.module';
@Module({
  imports: [SupabaseModule, RbacModule, NormalizationModule],
  controllers: [ApiIntegrationsController, ApiIntegrationsInternalController],
  providers: [
    ApiConnectorConfigService,
    ApiConnectorSyncService,
    ValueMappingsService,
    FieldParseRulesService,
    CanonicalValueDomainsService,
  ],
})
export class ApiIntegrationsModule {}
