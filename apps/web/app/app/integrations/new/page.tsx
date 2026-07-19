'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../components/ui';
import { createIntegrationSource } from '../../../../lib/integrations-api';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../lib/rbac';
import { getSessionContext } from '../../../../lib/setup-api';

const options = [
  { type: 'spreadsheet', title: 'Planilha', description: 'Suba um arquivo de exemplo, pareie as colunas e deixe a integração pronta.' },
  { type: 'api', title: 'API', description: 'Conector disponível em sprint futura.', disabled: true },
  { type: 'database', title: 'Banco de dados', description: 'Conector disponível em sprint futura.', disabled: true },
  { type: 'whatsapp', title: 'WhatsApp', description: 'Conector disponível em sprint futura.', disabled: true },
  { type: 'tracker', title: 'Rastreador', description: 'Conector disponível em sprint futura.', disabled: true },
  { type: 'other', title: 'Outro', description: 'Outros conectores serão disponibilizados em sprint futura.', disabled: true },
];

export default function NewIntegrationPage() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState('');
  const [perms, setPerms] = useState<UserPermission[]>([]);
  const [msg, setMsg] = useState('Carregando tipos de integração...');
  useEffect(() => { getSessionContext().then(async (ctx) => { if (!ctx.user) return setMsg('Faça login para criar integração.'); if (!ctx.tenantId) return setMsg('Selecione um tenant ativo.'); setTenantId(ctx.tenantId); const p = await getCurrentUserPermissions(ctx.tenantId); setPerms(p); if (!hasPermission(p, 'core.data_sources.create')) return setMsg('Acesso negado: permissão core.data_sources.create é necessária.'); setMsg(''); }).catch((e: Error) => setMsg(e.message)); }, []);
  async function create(type: string) { const name = `Nova integração ${options.find((item) => item.type === type)?.title ?? ''}`.trim(); const id = await createIntegrationSource(tenantId, { name, source_type: type, module_key: 'transporte' }); router.push(`/app/integrations/${id}/setup`); }
  return <div className="page-stack app-page"><SectionHeader eyebrow="Nova integração" title="Escolha o tipo de integração" description="Comece escolhendo de onde os dados virão. Por enquanto, somente Planilha está disponível." />{msg ? <EmptyState title="Nova integração" description={msg} /> : null}<div className="grid gap-4 md:grid-cols-2">{options.map((option) => <Card key={option.type}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{option.title}</h2>{option.disabled === true ? <StatusBadge tone="warning">em breve</StatusBadge> : <StatusBadge tone="info">disponível</StatusBadge>}</div><p className="mt-3 min-h-16 text-sm leading-6 text-slate-600">{option.description}</p><button disabled={!hasPermission(perms, 'core.data_sources.create') || option.disabled === true} onClick={() => create(option.type)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300" type="button">{option.disabled === true ? 'Em breve' : `Escolher ${option.title}`}</button></Card>)}</div></div>;
}
