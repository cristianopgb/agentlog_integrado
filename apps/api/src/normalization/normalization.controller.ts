import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { NormalizationService } from './normalization.service';

@Controller('tenants/:tenantId')
@UseGuards(AuthGuard, PermissionsGuard)
export class NormalizationController {
  constructor(private readonly service: NormalizationService) {}

  @Post('staging-batches/:batchId/normalize')
  @RequirePermission(['normalization.run', 'native_records.manage'], 'tenantId', 'all')
  normalize(@Param('tenantId') tenantId: string, @Param('batchId') batchId: string, @Req() req: AuthenticatedRequest) {
    return this.service.normalizeBatch(tenantId, batchId, req.user.id);
  }

  @Get('normalization-runs')
  @RequirePermission(['normalization.view', 'normalization.run'])
  list(@Param('tenantId') tenantId: string) {
    return this.service.listRuns(tenantId);
  }

  @Get('normalization-runs/:runId')
  @RequirePermission(['normalization.view', 'normalization.run'])
  get(@Param('tenantId') tenantId: string, @Param('runId') runId: string) {
    return this.service.getRun(tenantId, runId);
  }
}
