import { Body, Controller, Delete, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { StagingService } from './staging.service';

@Controller('tenants/:tenantId/data-sources')
@UseGuards(AuthGuard, PermissionsGuard)
export class DataSourceUploadsController {
  constructor(private readonly service: StagingService) {}

  @Post(':sourceId/upload')
  @RequirePermission('staging.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@Param('tenantId') tenantId: string, @Param('sourceId') sourceId: string, @Req() req: AuthenticatedRequest, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    return this.service.uploadDataSourceFile(tenantId, sourceId, req.user.id, file);
  }

  @Patch(':sourceId/inactivate')
  @RequirePermission('integrations.manage')
  inactivate(@Param('tenantId') tenantId: string, @Param('sourceId') sourceId: string, @Req() req: AuthenticatedRequest) {
    return this.service.archiveDataSource(tenantId, sourceId, req.user.id, 'inactive');
  }

  @Patch(':sourceId/status')
  @RequirePermission('integrations.manage')
  status(@Param('tenantId') tenantId: string, @Param('sourceId') sourceId: string, @Req() req: AuthenticatedRequest, @Body() body: { status?: string }) {
    return this.service.archiveDataSource(tenantId, sourceId, req.user.id, body.status);
  }

  @Delete(':sourceId')
  @RequirePermission('integrations.manage')
  remove(@Param('tenantId') tenantId: string, @Param('sourceId') sourceId: string) {
    return this.service.deleteDataSourceIfUnused(tenantId, sourceId);
  }
}
