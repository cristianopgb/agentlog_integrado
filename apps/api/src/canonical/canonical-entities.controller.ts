import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MappingService } from './mapping.service';

@Controller('tenants/:tenantId/canonical-entities')
@UseGuards(AuthGuard, PermissionsGuard)
export class CanonicalEntitiesController {
  constructor(private readonly service: MappingService) {}
  @Get() @RequirePermission('core.canonical_entities.view') list(@Param('tenantId') tenantId: string) { return this.service.listEntities(tenantId); }
  @Post() @RequirePermission('core.canonical_entities.create') create(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createEntity(tenantId, req.user.id, body); }
  @Get(':entityId') @RequirePermission('core.canonical_entities.view') get(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) { return this.service.getEntity(tenantId, entityId); }
  @Patch(':entityId') @RequirePermission('core.canonical_entities.update') update(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateEntity(tenantId, entityId, req.user.id, body); }
  @Get(':entityId/fields') @RequirePermission('core.canonical_fields.view') fields(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) { return this.service.listFields(tenantId, entityId); }
  @Post(':entityId/fields') @RequirePermission('core.canonical_fields.create') createField(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createField(tenantId, entityId, req.user.id, body); }
  @Get(':entityId/validation-rules') @RequirePermission('core.validation_rules.view') validationRules(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string) { return this.service.listValidationRules(tenantId, entityId); }
  @Post(':entityId/validation-rules') @RequirePermission('core.validation_rules.create') createValidationRule(@Param('tenantId') tenantId: string, @Param('entityId') entityId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createValidationRule(tenantId, entityId, req.user.id, body); }
}
