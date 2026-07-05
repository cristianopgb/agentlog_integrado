import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DataContractsService } from './data-contracts.service';
@Controller('tenants/:tenantId/data-sources')
@UseGuards(AuthGuard, PermissionsGuard)
export class DataSourcesController { constructor(private readonly service: DataContractsService) {}
@Get() @RequirePermission('core.data_sources.view') list(@Param('tenantId') tenantId: string) { return this.service.listSources(tenantId); }
@Post() @RequirePermission('core.data_sources.create') create(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createSource(tenantId, req.user.id, body); }
@Patch(':sourceId') @RequirePermission('core.data_sources.update') update(@Param('tenantId') tenantId: string, @Param('sourceId') sourceId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateSource(tenantId, sourceId, req.user.id, body); }}
