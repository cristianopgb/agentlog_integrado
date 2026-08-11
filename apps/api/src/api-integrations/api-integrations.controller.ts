import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ApiConnectorConfigService } from './api-connector-config.service';
import { ApiConnectorSyncService } from './api-connector-sync.service';
import { ValueMappingsService } from './value-mappings.service';
import { FieldParseRulesService } from './field-parse-rules.service';
@Controller('tenants/:tenantId/integrations/:sourceId')
@UseGuards(AuthGuard, PermissionsGuard)
export class ApiIntegrationsController {
  constructor(
    private readonly configs: ApiConnectorConfigService,
    private readonly syncs: ApiConnectorSyncService,
    private readonly values: ValueMappingsService,
    private readonly formats: FieldParseRulesService,
    private readonly rbac: RbacService,
  ) {}
  @Get('api-config') @RequirePermission('integrations.api.configure') get(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
  ) {
    return this.configs.get(t, s);
  }
  @Put('api-config') @RequirePermission('integrations.api.configure') async put(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    if (body.auto_sync_enabled !== undefined)
      await this.rbac.ensurePermission(req.user.id, t, [
        'integrations.api.manage_auto_sync',
      ]);
    return this.configs.save(t, s, body);
  }
  @Post('api-test') @RequirePermission('integrations.api.test') test(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
  ) {
    return this.syncs.test(t, s);
  }
  @Post('api-sample') @RequirePermission('integrations.api.test') sample(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
  ) {
    return this.syncs.sample(t, s);
  }
  @Get('api-field-mappings')
  @RequirePermission('integrations.api.configure')
  mappings(@Param('tenantId') t: string, @Param('sourceId') s: string) {
    return this.syncs.listApiMappings(t, s);
  }
  @Put('api-field-mappings')
  @RequirePermission('integrations.api.configure')
  saveMappings(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      mappings?: Array<{
        source_field_name?: string;
        data_contract_field_id?: string;
        canonical_entity_id?: string;
        canonical_field_id?: string;
      }>;
    },
  ) {
    return this.syncs.saveApiMappings(t, s, req.user.id, body);
  }
  @Get('value-mappings')
  @RequirePermission('integrations.value_mappings.read')
  valueMappings(@Param('tenantId') t: string, @Param('sourceId') s: string) {
    return this.values.list(t, s);
  }
  @Put('value-mappings')
  @RequirePermission('integrations.value_mappings.manage')
  saveValueMappings(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      mappings?: Array<{
        source_field_name?: string;
        data_contract_field_id?: string;
        source_value?: string;
        target_value?: string | null;
      }>;
    },
  ) {
    return this.values.save(t, s, req.user.id, body);
  }
  @Get('field-parse-rules')
  @RequirePermission('integrations.field_formats.read')
  fieldFormats(@Param('tenantId') t: string, @Param('sourceId') s: string) {
    return this.formats.list(t, s);
  }
  @Put('field-parse-rules')
  @RequirePermission('integrations.field_formats.manage')
  saveFieldFormats(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { rules?: Array<Record<string, unknown>> },
  ) {
    return this.formats.save(t, s, req.user.id, body as never);
  }
  @Post('field-parse-rules')
  @RequirePermission('integrations.field_formats.manage')
  createFieldFormats(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { rules?: Array<Record<string, unknown>> },
  ) {
    return this.formats.save(t, s, req.user.id, body as never);
  }
  @Patch('field-parse-rules')
  @RequirePermission('integrations.field_formats.manage')
  patchFieldFormats(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { rules?: Array<Record<string, unknown>> },
  ) {
    return this.formats.save(t, s, req.user.id, body as never);
  }
  @Post('api-sync-now') @RequirePermission('integrations.api.sync_now') sync(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.syncs.sync(t, s, 'manual', req.user.id);
  }
  @Get('api-sync-runs') @RequirePermission('integrations.api.view_logs') runs(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
  ) {
    return this.syncs.listRuns(t, s);
  }
  @Post('staging-batches/:batchId/revalidate-current-rules')
  @RequirePermission('integrations.api.sync_now')
  revalidate(
    @Param('tenantId') t: string,
    @Param('sourceId') s: string,
    @Param('batchId') b: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.syncs.revalidateBatchWithCurrentRules(t, s, b, req.user.id);
  }
}
@Controller('internal/integrations/api')
export class ApiIntegrationsInternalController {
  constructor(private readonly syncs: ApiConnectorSyncService) {}
  @Post('sync-due') syncDue(
    @Headers('x-cron-secret') secret: string,
    @Body() body: { limit?: number },
  ) {
    const expected = process.env.CRON_SECRET;
    if (!expected || secret !== expected)
      throw new UnauthorizedException('Invalid cron credential.');
    return this.syncs.syncDue(body?.limit);
  }
}
