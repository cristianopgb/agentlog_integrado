import { createBrowserSupabaseClient } from './supabase';

export type TenantModuleOption = {
  key: string;
  name: string;
};

const allowedIntegrationModules = new Set([
  'transporte',
  'atendimento',
  'financeiro',
  'armazem',
  'equipes',
]);

type TenantModuleRow = {
  module: TenantModuleOption | TenantModuleOption[] | null;
};

export async function listEnabledTenantModules(
  tenantId: string,
): Promise<TenantModuleOption[]> {
  const { data, error } = await createBrowserSupabaseClient()
    .from('tenant_modules')
    .select('module:modules(key,name)')
    .eq('tenant_id', tenantId)
    .eq('is_active', 'true');
  if (error) throw error;
  return ((data ?? []) as TenantModuleRow[])
    .map((row) => (Array.isArray(row.module) ? row.module[0] : row.module))
    .filter((item): item is TenantModuleOption => {
      return Boolean(item) && allowedIntegrationModules.has(item!.key);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
