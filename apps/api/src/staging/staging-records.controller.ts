import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { StagingService } from './staging.service';
@Controller('tenants/:tenantId/staging-batches/:batchId/records')
@UseGuards(AuthGuard, PermissionsGuard)
export class StagingRecordsController { constructor(private readonly service: StagingService) {}
@Get() @RequirePermission('core.staging_records.view') list(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string) { return this.service.listRecords(tenantId, batchId); }
@Post() @RequirePermission('core.staging_records.create') create(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string, @Body() body: Record<string, unknown>) { return this.service.createRecords(tenantId, batchId, body); }}
