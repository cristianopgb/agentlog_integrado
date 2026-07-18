import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DashboardsService } from './dashboards.service';

@Controller('tenants/:tenantId/dashboards')
@UseGuards(AuthGuard, PermissionsGuard)
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}
  @Get() @RequirePermission('dashboards.view') list(@Param('tenantId') tenantId:string){return this.service.list(tenantId);}
  @Post() @RequirePermission('dashboards.manage') create(@Param('tenantId') tenantId:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.create(tenantId,req.user.id,body);}
  @Get(':id') @RequirePermission('dashboards.view') detail(@Param('tenantId') tenantId:string,@Param('id') id:string){return this.service.detail(tenantId,id);}
  @Patch(':id') @RequirePermission('dashboards.manage') update(@Param('tenantId') tenantId:string,@Param('id') id:string,@Body() body:Record<string,unknown>){return this.service.update(tenantId,id,body);}
  @Delete(':id') @RequirePermission('dashboards.manage') remove(@Param('tenantId') tenantId:string,@Param('id') id:string){return this.service.remove(tenantId,id);}
  @Get(':id/widgets') @RequirePermission('dashboards.view') widgets(@Param('tenantId') tenantId:string,@Param('id') id:string){return this.service.widgets(tenantId,id);}
  @Post(':id/widgets') @RequirePermission('dashboards.manage') addWidget(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.addWidget(tenantId,id,req.user.id,body);}
  @Patch(':id/widgets/:widgetId') @RequirePermission('dashboards.manage') updateWidget(@Param('tenantId') tenantId:string,@Param('id') id:string,@Param('widgetId') widgetId:string,@Body() body:Record<string,unknown>){return this.service.updateWidget(tenantId,id,widgetId,body);}
  @Delete(':id/widgets/:widgetId') @RequirePermission('dashboards.manage') deleteWidget(@Param('tenantId') tenantId:string,@Param('id') id:string,@Param('widgetId') widgetId:string){return this.service.deleteWidget(tenantId,id,widgetId);}
  @Post(':id/preview') @RequirePermission('dashboards.preview') preview(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>={}){return this.service.preview(tenantId,id,req.user.id,body);}
  @Post(':id/publish') @RequirePermission('dashboards.publish') publish(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest){return this.service.publish(tenantId,id,req.user.id);}
  @Get(':id/published') @RequirePermission('dashboards.view') published(@Param('tenantId') tenantId:string,@Param('id') id:string){return this.service.published(tenantId,id);}
}
