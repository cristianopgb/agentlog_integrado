import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MappingService } from './mapping.service';
@Controller('tenants/:tenantId')
@UseGuards(AuthGuard, PermissionsGuard)
export class FieldMappingsController { constructor(private readonly service: MappingService) {}
@Get('data-contracts/:contractId/field-mappings') @RequirePermission('core.field_mappings.view') list(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string) { return this.service.listMappings(tenantId, contractId); }
@Post('data-contracts/:contractId/field-mappings') @RequirePermission('core.field_mappings.create') create(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createMapping(tenantId, contractId, req.user.id, body); }
@Patch('field-mappings/:mappingId') @RequirePermission('core.field_mappings.update') update(@Param('tenantId') tenantId: string, @Param('mappingId') mappingId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateMapping(tenantId, mappingId, req.user.id, body); }
@Get('field-mappings/:mappingId/transformation-rules') @RequirePermission('core.transformation_rules.view') rules(@Param('tenantId') tenantId: string, @Param('mappingId') mappingId: string) { return this.service.listTransformationRules(tenantId, mappingId); }
@Post('field-mappings/:mappingId/transformation-rules') @RequirePermission('core.transformation_rules.create') createRule(@Param('tenantId') tenantId: string, @Param('mappingId') mappingId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createTransformationRule(tenantId, mappingId, req.user.id, body); }}
