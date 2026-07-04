import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/auth.guard';
import { REQUIRE_PERMISSION_KEY, PermissionRequirement } from './require-permission.decorator';
import { RbacService } from './rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly rbac: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(REQUIRE_PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requirement?.permissionKeys?.length) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const tenantId = request.params[requirement.tenantParam ?? 'tenantId'];
    const tenantIdValue = Array.isArray(tenantId) ? tenantId[0] : tenantId;
    if (!tenantIdValue) throw new ForbiddenException('Tenant context is required for this permission.');

    await this.rbac.ensurePermission(request.user.id, tenantIdValue, requirement.permissionKeys as string[], requirement.mode ?? 'any');
    return true;
  }
}
