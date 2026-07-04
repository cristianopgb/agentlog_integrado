import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { SetupService } from './setup.service';
@Controller('tenants/:tenantId/setup-steps')
@UseGuards(AuthGuard, PermissionsGuard)
export class SetupStepsController { constructor(private readonly setup: SetupService) {}
  @Patch(':stepId') @RequirePermission('setup.steps.update') update(@Param('tenantId') tenantId: string, @Param('stepId') stepId: string, @Body() body: Record<string, unknown>) { return this.setup.updateStep(tenantId, stepId, body); }
}
