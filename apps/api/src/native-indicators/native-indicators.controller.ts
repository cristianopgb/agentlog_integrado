import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { NativeIndicatorsService } from './native-indicators.service';

@Controller('tenants/:tenantId/native-indicators')
@UseGuards(AuthGuard, PermissionsGuard)
export class NativeIndicatorsController {
  constructor(private readonly service: NativeIndicatorsService) {}

  @Get()
  @RequirePermission('indicators.view')
  list(@Param('tenantId') tenantId: string) { return this.service.list(tenantId); }

  @Get('summary')
  @RequirePermission('indicators.view')
  summary(@Param('tenantId') tenantId: string) { return this.service.summary(tenantId); }

  @Get(':indicatorKey')
  @RequirePermission('indicators.view')
  detail(@Param('tenantId') tenantId: string, @Param('indicatorKey') indicatorKey: string) { return this.service.detail(tenantId, indicatorKey); }

  @Post(':indicatorKey/preview')
  @RequirePermission('indicators.preview')
  preview(@Param('tenantId') tenantId: string, @Param('indicatorKey') indicatorKey: string, @Req() request: AuthenticatedRequest) { return this.service.preview(tenantId, indicatorKey, request.user.id, true); }
}
