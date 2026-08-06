import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { OccurrencesService } from './occurrences.service';

@Controller('tenants/:tenantId/occurrences')
@UseGuards(AuthGuard, PermissionsGuard)
export class OccurrencesController {
  constructor(private readonly service: OccurrencesService) {}
  @Get() @RequirePermission('occurrences.view') list(@Param('tenantId') tenantId:string,@Query() query:Record<string,string>){return this.service.list(tenantId,query);}
  @Post() @RequirePermission('occurrences.create') create(@Param('tenantId') tenantId:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.create(tenantId,req.user.id,body);}
  @Get('kanban') @RequirePermission('occurrences.kanban.view') kanban(@Param('tenantId') tenantId:string){return this.service.kanban(tenantId);}
  @Get(':id') @RequirePermission('occurrences.view') detail(@Param('tenantId') tenantId:string,@Param('id') id:string){return this.service.detail(tenantId,id);}
  @Patch(':id/status') @RequirePermission(['occurrences.update','occurrences.kanban.move']) status(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.changeStatus(tenantId,id,req.user.id,body);}
  @Patch(':id/assign') @RequirePermission('occurrences.assign') assign(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.assign(tenantId,id,req.user.id,body);}
  @Post(':id/events') @RequirePermission('occurrence_events.create') event(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.addEvent(tenantId,id,req.user.id,body);}
  @Post(':id/operation-links') @RequirePermission('occurrence_operation_links.create') link(@Param('tenantId') tenantId:string,@Param('id') id:string,@Req() req:AuthenticatedRequest,@Body() body:Record<string,unknown>){return this.service.addOperationLink(tenantId,id,req.user.id,body);}
  @Delete(':id/operation-links/:linkId') @RequirePermission('occurrence_operation_links.delete') unlink(@Param('tenantId') tenantId:string,@Param('id') id:string,@Param('linkId') linkId:string){return this.service.removeOperationLink(tenantId,id,linkId);}
}
