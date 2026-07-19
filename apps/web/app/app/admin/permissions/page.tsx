'use client';

import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader } from '../../../../components/ui';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../lib/rbac';
import { createBrowserSupabaseClient } from '../../../../lib/supabase';

type Profile = { active_tenant_id: string | null };

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [message, setMessage] = useState('Carregando permissões...');

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setMessage('Faça login para visualizar permissões.'); return; }
      const { data: profile } = await supabase.from('users_profile').select('active_tenant_id').eq('id', data.user.id).maybeSingle();
      const activeTenantId = (profile as Profile | null)?.active_tenant_id;
      const currentPermissions = await getCurrentUserPermissions(activeTenantId);
      if (!hasPermission(currentPermissions, 'core.permissions.view')) { setMessage('Acesso negado: permissão core.permissions.view é necessária.'); return; }
      const { data: permissionRows } = await supabase.from('permissions').select('id,key,name,module_key,resource,action,description');
      setPermissions((permissionRows ?? []) as UserPermission[]);
      setMessage('');
    });
  }, []);

  return (
    <div className="page-stack app-page">
      <SectionHeader eyebrow="Administração" title="Permissões" description="Catálogo mínimo de permissões disponíveis por módulo, recurso/tela e ação." />
      {message ? <EmptyState title="Status das permissões" description={message} /> : null}
      {permissions.length ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-6 py-4">Permissão</th><th className="px-6 py-4">Módulo</th><th className="px-6 py-4">Recurso</th><th className="px-6 py-4">Ação</th><th className="px-6 py-4">Descrição</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {permissions.map((permission) => (
                  <tr className="bg-white/80" key={permission.id}>
                    <td className="px-6 py-4"><p className="font-semibold text-slate-950">{permission.name}</p><p className="text-xs text-slate-500">{permission.key}</p></td>
                    <td className="px-6 py-4">{permission.module_key}</td>
                    <td className="px-6 py-4">{permission.resource}</td>
                    <td className="px-6 py-4">{permission.action}</td>
                    <td className="px-6 py-4 text-slate-600">{permission.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
