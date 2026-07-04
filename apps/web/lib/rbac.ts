import { createBrowserSupabaseClient } from './supabase';

export type UserPermission = { id: string; key: string; name: string; module_key: string | null; resource: string | null; action: string | null; description: string | null };

export async function getCurrentUserPermissions(tenantId?: string | null): Promise<UserPermission[]> {
  if (!tenantId) return [];
  const supabase = createBrowserSupabaseClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data: roleRows } = await supabase.from('user_roles').select('role_id').eq('user_id', user.user.id).eq('tenant_id', tenantId);
  const roleIds = ((roleRows ?? []) as Array<{ role_id: string }>).map((row) => row.role_id);
  if (!roleIds.length) return [];
  const permissions = await Promise.all(
    roleIds.map(async (roleId) => {
      const { data } = await supabase.from('role_permissions').select('permission:permissions(id,key,name,module_key,resource,action,description)').eq('tenant_id', tenantId).eq('role_id', roleId);
      return ((data ?? []) as Array<{ permission: UserPermission }>).map((row) => row.permission);
    }),
  );
  return Array.from(new Map(permissions.flat().map((permission) => [permission.key, permission])).values());
}

export function hasPermission(permissions: UserPermission[], permissionKey: string) {
  return permissions.some((permission) => permission.key === permissionKey);
}
