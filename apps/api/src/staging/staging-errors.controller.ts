import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { StagingService } from './staging.service';
@Controller('tenants/:tenantId/staging-batches/:batchId/errors')
@UseGuards(AuthGuard, PermissionsGuard)
export class StagingErrorsController { constructor(private readonly service: StagingService) {}
@Get() @RequirePermission('core.staging_errors.view') list(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string) { return this.service.listErrors(tenantId, batchId); }}
