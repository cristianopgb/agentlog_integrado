import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export type PermissionRequirement = {
  permissionKeys?: string[];
  tenantParam?: string;
  mode?: 'any' | 'all';
};

export function RequirePermission(permissionKeys: string | string[], tenantParam = 'tenantId', mode: 'any' | 'all' = 'any') {
  return SetMetadata(REQUIRE_PERMISSION_KEY, { permissionKeys: Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys], tenantParam, mode } satisfies PermissionRequirement);
}
