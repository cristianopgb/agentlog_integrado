import { Body, Controller, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SetupService } from './setup.service';
@Controller('tenants/:tenantId/setup-checklist-items')
@UseGuards(AuthGuard, PermissionsGuard)
export class SetupChecklistController { constructor(private readonly setup: SetupService) {}
  @Patch(':itemId') @RequirePermission('setup.checklist.update') update(@Param('tenantId') tenantId: string, @Param('itemId') itemId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.setup.updateChecklistItem(tenantId, itemId, req.user.id, body); }
}
