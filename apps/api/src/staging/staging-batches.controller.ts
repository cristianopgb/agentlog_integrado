import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { StagingService } from './staging.service';
@Controller('tenants/:tenantId/staging-batches')
@UseGuards(AuthGuard, PermissionsGuard)
export class StagingBatchesController { constructor(private readonly service: StagingService) {}
@Get() @RequirePermission('core.staging_batches.view') list(@Param('tenantId') tenantId: string) { return this.service.listBatches(tenantId); }
@Post() @RequirePermission('core.staging_batches.create') create(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createBatch(tenantId, req.user.id, body); }
@Get(':batchId') @RequirePermission('core.staging_batches.view') get(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string) { return this.service.getBatch(tenantId, batchId); }
@Patch(':batchId') @RequirePermission('core.staging_batches.update') update(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateBatch(tenantId, batchId, req.user.id, body); }
@Post(':batchId/validate') @RequirePermission('core.staging_batches.validate') validate(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string) { return this.service.validateBatch(tenantId, batchId); }}
