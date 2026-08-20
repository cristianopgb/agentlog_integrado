import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { TenantLogisticKeyService } from '../normalization/tenant-logistic-key.service';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';

@Controller('tenants/:tenantId/setup/logistic-key')
@UseGuards(AuthGuard, PermissionsGuard)
export class SetupLogisticKeyController {
  constructor(private readonly logisticKeys: TenantLogisticKeyService) {}

  @Get()
  @RequirePermission('integrations.api.configure')
  get(@Param('tenantId') tenantId: string) {
    return this.logisticKeys.get(tenantId);
  }

  @Post()
  @RequirePermission('integrations.api.configure')
  establish(
    @Param('tenantId') tenantId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body: { primary_logistic_key?: string; confirmed?: boolean },
  ) {
    if (body.confirmed !== true)
      throw new BadRequestException('Confirme explicitamente a chave logística principal.');
    return this.logisticKeys.establish(
      tenantId,
      null,
      body.primary_logistic_key ?? '',
      request.user.id,
    );
  }
}
