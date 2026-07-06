import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { MappingService } from './mapping.service';
@Controller('tenants/:tenantId/canonical-fields')
@UseGuards(AuthGuard, PermissionsGuard)
export class CanonicalFieldsController { constructor(private readonly service: MappingService) {}
@Patch(':fieldId') @RequirePermission('core.canonical_fields.update') update(@Param('tenantId') tenantId: string, @Param('fieldId') fieldId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateField(tenantId, fieldId, req.user.id, body); }}
