import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MappingService } from './mapping.service';
@Controller('tenants/:tenantId')
@UseGuards(AuthGuard, PermissionsGuard)
export class RulesController { constructor(private readonly service: MappingService) {}
@Patch('transformation-rules/:ruleId') @RequirePermission('core.transformation_rules.update') updateTransformation(@Param('tenantId') tenantId: string, @Param('ruleId') ruleId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateTransformationRule(tenantId, ruleId, req.user.id, body); }
@Patch('validation-rules/:ruleId') @RequirePermission('core.validation_rules.update') updateValidation(@Param('tenantId') tenantId: string, @Param('ruleId') ruleId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateValidationRule(tenantId, ruleId, req.user.id, body); }}
