import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { CustomIndicatorsService } from './custom-indicators.service';

@Controller('tenants/:tenantId')
@UseGuards(AuthGuard, PermissionsGuard)
export class CustomIndicatorsController {
  constructor(private readonly service: CustomIndicatorsService) {}
  @Get('indicator-fields') @RequirePermission('indicators.view') fields(@Param('tenantId') tenantId:string){return this.service.fields(tenantId);}
  @Get('custom-indicators') @RequirePermission('indicators.view') list(@Param('tenantId') tenantId:string){return this.service.list(tenantId);}
  @Get('custom-indicators/:indicatorId') @RequirePermission('indicators.view') detail(@Param('tenantId') tenantId:string,@Param('indicatorId') id:string){return this.service.detail(tenantId,id);}
  @Post('custom-indicators/preview') @RequirePermission('indicators.preview') previewUnsaved(@Param('tenantId') tenantId:string,@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.previewUnsaved(tenantId,req.user.id,body);}
  @Post('custom-indicators') @RequirePermission('indicators.manage') create(@Param('tenantId') tenantId:string,@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.create(tenantId,req.user.id,body);}
  @Patch('custom-indicators/:indicatorId') @RequirePermission('indicators.manage') update(@Param('tenantId') tenantId:string,@Param('indicatorId') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthenticatedRequest){return this.service.update(tenantId,id,req.user.id,body);}
  @Patch('custom-indicators/:indicatorId/status') @RequirePermission('indicators.manage') status(@Param('tenantId') tenantId:string,@Param('indicatorId') id:string,@Body() body:{status?:string},@Req() req:AuthenticatedRequest){return this.service.status(tenantId,id,req.user.id,body);}
  @Post('custom-indicators/:indicatorId/preview') @RequirePermission('indicators.preview') previewSaved(@Param('tenantId') tenantId:string,@Param('indicatorId') id:string,@Req() req:AuthenticatedRequest){return this.service.previewSaved(tenantId,id,req.user.id);}
  @Get('indicators/library') @RequirePermission('indicators.view') library(@Param('tenantId') tenantId:string){return this.service.library(tenantId);}
}
