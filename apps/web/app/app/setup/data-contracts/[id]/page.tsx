'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, EmptyState, SectionHeader, StatusBadge } from '../../../../../components/ui';
import { createAllowedValue, createContractField, getDataContract, listAllowedValues, listContractFields, updateContractField, updateDataContract, type AllowedValue, type DataContract, type DataContractField } from '../../../../../lib/data-contracts-api';
import { getCurrentUserPermissions, hasPermission, type UserPermission } from '../../../../../lib/rbac';
import { getSessionContext } from '../../../../../lib/setup-api';

export default function DataContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenantId, setTenantId] = useState('');
  const [contract, setContract] = useState<DataContract | null>(null);
  const [fields, setFields] = useState<DataContractField[]>([]);
  const [values, setValues] = useState<Record<string, AllowedValue[]>>({});
  const [perms, setPerms] = useState<UserPermission[]>([]);
  const [msg, setMsg] = useState('Carregando contrato...');
  const canActivate = hasPermission(perms, 'core.data_contracts.activate');

  async function load(t: string) {
    const c = await getDataContract(t, id);
    setContract(c);
    if (!c) {
      setFields([]);
      setValues({});
      setMsg('Contrato não encontrado ou sem permissão.');
      return;
    }
    setMsg('');
    const fs = await listContractFields(t, id);
    setFields(fs);
    const pairs = await Promise.all(fs.map(async (f) => [f.id, await listAllowedValues(t, f.id)] as const));
    setValues(Object.fromEntries(pairs));
  }

  useEffect(() => {
    getSessionContext().then(async (c) => {
      if (!c.user) return setMsg('Faça login para visualizar contrato.');
      if (!c.tenantId) return setMsg('Selecione um tenant ativo.');
      setTenantId(c.tenantId);
      const p = await getCurrentUserPermissions(c.tenantId);
      setPerms(p);
      if (!hasPermission(p, 'core.data_contracts.view')) return setMsg('Acesso negado: permissão core.data_contracts.view é necessária.');
      await load(c.tenantId);
    }).catch((e: Error) => setMsg(e.message));
  }, [id]);

  async function addField(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contract) {
      setMsg('Contrato não encontrado ou sem permissão.');
      return;
    }
    const f = new FormData(e.currentTarget);
    await createContractField(tenantId, id, {
      field_key: String(f.get('field_key')),
      source_field_name: String(f.get('source_field_name')),
      data_type: String(f.get('data_type')),
      is_required: f.get('is_required') === 'on',
      sort_order: Number(f.get('sort_order') || 0),
    });
    e.currentTarget.reset();
    await load(tenantId);
  }

  return <div className="mx-auto max-w-7xl space-y-8"><SectionHeader eyebrow="Setup" title="Detalhe do contrato" description="Campos, validações simples e valores aceitos declarativos." />{msg ? <EmptyState title="Contrato" description={msg} /> : null}{contract ? <Card><StatusBadge>{contract.status}</StatusBadge><h2 className="mt-3 text-xl font-bold">{contract.name}</h2><p className="text-sm text-slate-600">{contract.module_key}/{contract.entity_key} · {contract.format} · versão {contract.contract_version}</p>{hasPermission(perms, 'core.data_contracts.update') ? <select className="mt-4 rounded-xl border p-2" value={contract.status} onChange={async (e) => { await updateDataContract(tenantId, id, { status: e.target.value }); await load(tenantId); }}><option>draft</option>{canActivate ? <option>active</option> : contract.status === 'active' ? <option disabled>active</option> : null}<option>inactive</option><option>deprecated</option><option>rejected</option></select> : null}</Card> : null}{contract && hasPermission(perms, 'core.data_contract_fields.update') ? <Card><form onSubmit={addField} className="grid gap-3 md:grid-cols-6"><input name="field_key" required placeholder="field_key" className="rounded-xl border p-2" /><input name="source_field_name" required placeholder="Campo origem" className="rounded-xl border p-2" /><select name="data_type" className="rounded-xl border p-2"><option>text</option><option>integer</option><option>decimal</option><option>boolean</option><option>date</option><option>datetime</option><option>enum</option><option>json</option></select><label className="flex items-center gap-2 text-sm"><input name="is_required" type="checkbox" /> obrigatório</label><input name="sort_order" type="number" placeholder="Ordem" className="rounded-xl border p-2" /><button className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white">Adicionar campo</button></form></Card> : null}<div className="grid gap-4">{fields.map((f) => <Card key={f.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold">{f.field_key}</h3><p className="text-sm text-slate-600">Origem: {f.source_field_name} · tipo {f.data_type} · obrigatório {f.is_required ? 'sim' : 'não'}</p><p className="text-sm text-slate-600">Validações: min {f.min_length ?? '-'} max {f.max_length ?? '-'} regex {f.regex_pattern ?? '-'} data {f.date_format ?? '-'}</p></div>{hasPermission(perms, 'core.data_contract_fields.update') ? <button className="rounded-xl border px-3 py-2 text-sm" onClick={async () => { await updateContractField(tenantId, f.id, { is_required: !f.is_required }); await load(tenantId); }}>Alternar obrigatório</button> : null}</div>{f.data_type === 'enum' ? <div className="mt-4"><p className="text-sm font-semibold">Allowed values: {(values[f.id] ?? []).map((v) => v.value).join(', ') || 'nenhum'}</p>{hasPermission(perms, 'core.data_contract_fields.update') ? <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); await createAllowedValue(tenantId, id, f.id, String(fd.get('value'))); e.currentTarget.reset(); await load(tenantId); }}><input name="value" required placeholder="valor aceito" className="rounded-xl border p-2" /><button className="rounded-xl bg-slate-950 px-3 py-2 text-white">Adicionar</button></form> : null}</div> : null}</Card>)}</div></div>;
}
