import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MappingService } from './mapping.service';

@Controller('tenants/:tenantId/native-schema')
@UseGuards(AuthGuard, PermissionsGuard)
export class NativeSchemaController {
  constructor(private readonly service: MappingService) {}

  @Get()
  @RequirePermission('native_schema.view')
  list(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Query('module') moduleKey?: string) {
    return this.service.listNativeSchema(tenantId, req.user.id, moduleKey);
  }
}
