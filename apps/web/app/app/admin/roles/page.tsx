'use client';

import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader } from '../../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../lib/rbac';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

type Role = { id: string; key: string; name: string; role_permissions?: Array<{ count: number }> };

type Profile = { active_tenant_id: string | null };

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [message, setMessage] = useState('Carregando roles...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setMessage('Faça login para visualizar roles.'); return; }
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      if (!activeTenantId) { setMessage('Selecione um tenant ativo para visualizar roles.'); return; }
      const loadedPermissions = await getCurrentUserPermissions(activeTenantId);
      setPermissions(loadedPermissions);
      if (!hasPermission(loadedPermissions, 'core.roles.view')) { setMessage('Acesso negado: permissão core.roles.view é necessária.'); return; }
      const { data: roleRows } = await supabase.from('roles').select('id,key,name,role_permissions(count)').eq('tenant_id', activeTenantId);
      setRoles((roleRows ?? []) as Role[]);
      setMessage('');
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <SectionHeader eyebrow="Administração" title="Funções" description="Consulta das funções da empresa ativa e do total de permissões vinculadas." />
      {message ? <EmptyState title="Status das funções" description={message} /> : null}
      {hasPermission(permissions, 'core.roles.view') && roles.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <Card key={role.id}>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{role.key}</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{role.name}</h2>
              <p className="mt-4 text-sm text-slate-600">Permissões vinculadas: {role.role_permissions?.[0]?.count ?? 0}</p>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
