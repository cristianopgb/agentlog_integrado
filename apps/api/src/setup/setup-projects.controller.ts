import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { SetupService } from './setup.service';

@Controller('tenants/:tenantId/setup-projects')
@UseGuards(AuthGuard, PermissionsGuard)
export class SetupProjectsController {
  constructor(private readonly setup: SetupService) {}
  @Get() @RequirePermission('setup.projects.view') list(@Param('tenantId') tenantId: string) { return this.setup.listProjects(tenantId); }
  @Post() @RequirePermission('setup.projects.create') create(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.setup.createProject(tenantId, req.user.id, body); }
  @Get(':projectId') @RequirePermission('setup.projects.view') get(@Param('tenantId') tenantId: string, @Param('projectId') projectId: string) { return this.setup.getProject(tenantId, projectId); }
  @Patch(':projectId') @RequirePermission('setup.projects.update') update(@Param('tenantId') tenantId: string, @Param('projectId') projectId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.setup.updateProject(tenantId, projectId, req.user.id, body); }
  @Get(':projectId/steps') @RequirePermission('setup.steps.view') steps(@Param('tenantId') tenantId: string, @Param('projectId') projectId: string) { return this.setup.listSteps(tenantId, projectId); }
  @Get(':projectId/checklist') @RequirePermission('setup.checklist.view') checklist(@Param('tenantId') tenantId: string, @Param('projectId') projectId: string) { return this.setup.listChecklist(tenantId, projectId); }
}
