const fallbackLogisticKeyReturn = '/app/integrations';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {string | null | undefined} sourceId */
export function logisticKeyReturnPath(sourceId) {
  if (!sourceId || !uuidPattern.test(sourceId)) return fallbackLogisticKeyReturn;
  return `/app/integrations/${sourceId}/setup?apiPhase=mapping`;
}

/** @param {{ auth: { getUser: () => Promise<{ data: { user: unknown | null }, error: Error | null }> }, from: (table: string) => { select: (columns: string) => unknown } }} supabase */
export async function getStrictLogisticKeySetupContext(supabase) {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Falha ao autenticar o usuário: ${authError.message}`);
  if (!data.user) return { user: null, tenantId: null };

  const { data: profile, error: profileError } = await supabase
    .from('users_profile')
    .select('active_tenant_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) throw new Error(`Falha ao consultar a empresa ativa: ${profileError.message}`);

  return {
    user: data.user,
    tenantId: profile?.active_tenant_id ?? null,
  };
}

/**
 * @param {() => Promise<{ user: unknown | null, tenantId: string | null }>} getContext
 * @param {(tenantId: string) => Promise<unknown | null>} getSetting
 */
export async function loadLogisticKeySetupState(getContext, getSetting) {
  try {
    const context = await getContext();
    if (!context.user) throw new Error('Faça login para configurar a chave logística oficial.');
    if (!context.tenantId) throw new Error('Selecione uma empresa ativa para configurar a chave logística oficial.');
    const setting = await getSetting(context.tenantId);
    return { state: setting ? 'configured' : 'unset', context, setting, error: '' };
  } catch (error) {
    if (error && typeof error === 'object' && error.status === 403)
      return { state: 'forbidden', context: null, setting: null, error: '' };
    return {
      state: 'error',
      context: null,
      setting: null,
      error: error instanceof Error ? error.message : 'Não foi possível consultar a chave logística oficial.',
    };
  }
}

export { fallbackLogisticKeyReturn };
