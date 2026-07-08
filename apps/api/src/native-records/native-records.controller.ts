import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { NativeRecordsService } from './native-records.service';

@Controller('tenants/:tenantId/native-records')
@UseGuards(AuthGuard, PermissionsGuard)
@RequirePermission('native_records.view')
export class NativeRecordsController {
  constructor(private readonly service: NativeRecordsService) {}

  @Get()
  list(@Param('tenantId') tenantId: string, @Query('search') search?: string, @Query('quality') quality?: string, @Query('source') source?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.list(tenantId, { search, quality, source, limit, offset });
  }

  @Get(':recordId')
  get(@Param('tenantId') tenantId: string, @Param('recordId') recordId: string) {
    return this.service.get(tenantId, recordId);
  }

  @Get(':recordId/events')
  events(@Param('tenantId') tenantId: string, @Param('recordId') recordId: string) {
    return this.service.events(tenantId, recordId);
  }

  @Get(':recordId/extensions')
  extensions(@Param('tenantId') tenantId: string, @Param('recordId') recordId: string) {
    return this.service.extensions(tenantId, recordId);
  }
}
