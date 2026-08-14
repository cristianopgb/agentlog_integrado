'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getSessionContext } from '../../../../lib/setup-api';
import {
  assignInbox,
  inboxDetail,
  linkInboxOccurrence,
  listInbox,
  registerInboxMessage,
  uploadInboxAttachment,
  setInboxStatus,
  type InboxConversation,
  type InboxDetail,
} from '../../../../lib/inbox-api';
import {
  listOccurrences,
  type Occurrence,
} from '../../../../lib/occurrences-api';

const statusLabels: Record<string, string> = {
  open: 'Aberta',
  waiting_contact: 'Aguardando contato',
  waiting_internal: 'Aguardando interno',
  assigned: 'Atribuída',
  closed: 'Fechada',
  archived: 'Arquivada',
};
export default function InboxPage() {
  const [tenant, setTenant] = useState<string | null>(null),
    [rows, setRows] = useState<InboxConversation[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<InboxDetail | null>(null),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [channel, setChannel] = useState(''),
    [message, setMessage] = useState(''),
    [occurrenceSearch, setOccurrenceSearch] = useState(''),
    [occurrences, setOccurrences] = useState<Occurrence[]>([]),
    [error, setError] = useState('');
  const load = useCallback(
    async (t: string) => {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (status) q.set('status', status);
      if (channel) q.set('channel', channel);
      setRows(await listInbox(t, q));
    },
    [search, status, channel],
  );
  const open = useCallback(async (t: string, id: string) => {
    setSelected(id);
    setDetail(await inboxDetail(t, id));
  }, []);
  useEffect(() => {
    getSessionContext().then((c) => {
      setTenant(c.tenantId);
      if (c.tenantId)
        load(c.tenantId).catch((e) => setError((e as Error).message));
    });
  }, [load]);
  useEffect(() => {
    if (tenant && selected)
      open(tenant, selected).catch((e) => setError((e as Error).message));
  }, [tenant, selected, open]);
  useEffect(() => {
    if (!tenant) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void load(tenant).catch(() =>
        setError(
          'Não foi possível atualizar o Inbox agora. Mantivemos os últimos dados carregados.',
        ),
      );
      if (selected)
        void inboxDetail(tenant, selected)
          .then(setDetail)
          .catch(() =>
            setError(
              'Não foi possível atualizar a conversa agora. Mantivemos a última versão carregada.',
            ),
          );
    }, 4000);
    return () => clearInterval(timer);
  }, [tenant, selected, load, open]);
  const refresh = async () => {
    if (tenant) {
      await load(tenant);
      if (selected) await open(tenant, selected);
    }
  };
  const action = async (fn: () => Promise<unknown>) => {
    try {
      setError('');
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const findOccurrences = async () => {
    if (!tenant) return;
    const q = new URLSearchParams({ search: occurrenceSearch, limit: '20' });
    setOccurrences(await listOccurrences(tenant, q));
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
          Atendimento
        </p>
        <h1 className="text-2xl font-bold">Inbox operacional</h1>
        <p className="text-sm text-slate-500">
          Conversas manuais e entradas controladas, sem envio externo
          automático.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="grid min-h-[680px] overflow-hidden rounded-2xl border bg-white shadow-sm lg:grid-cols-[300px_minmax(360px,1fr)_300px]">
        <aside className="border-r">
          <div className="space-y-2 border-b p-3">
            <input
              aria-label="Buscar conversas"
              className="w-full rounded-lg border p-2 text-sm"
              placeholder="Buscar conversa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label="Filtrar status"
                className="rounded-lg border p-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">Todos status</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar canal"
                className="rounded-lg border p-2 text-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Todos canais</option>
                {['manual', 'api', 'whatsapp', 'email', 'system'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="max-h-[610px] overflow-y-auto">
            {rows.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                Nenhuma conversa encontrada.
              </p>
            ) : (
              rows.map((row) => (
                <button
                  className={`w-full border-b p-4 text-left hover:bg-slate-50 ${selected === row.id ? 'bg-blue-50' : ''}`}
                  key={row.id}
                  onClick={() => tenant && open(tenant, row.id)}
                >
                  <div className="flex justify-between gap-2">
                    <strong className="truncate text-sm">
                      {row.contact?.name ||
                        row.contact?.phone ||
                        row.title ||
                        'Contato não identificado'}
                    </strong>
                    <time className="text-[11px] text-slate-400">
                      {row.last_message_at
                        ? new Date(row.last_message_at).toLocaleTimeString(
                            'pt-BR',
                            { hour: '2-digit', minute: '2-digit' },
                          )
                        : ''}
                    </time>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {row.last_message_preview || 'Sem mensagens'}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold">
                    {statusLabels[row.status] || row.status}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
        <main className="flex min-h-[680px] flex-col bg-slate-50">
          {!detail ? (
            <div className="m-auto text-center text-slate-500">
              <p className="font-medium">Selecione uma conversa</p>
              <p className="text-sm">As mensagens aparecerão aqui.</p>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b bg-white p-4">
                <div>
                  <strong>
                    {detail.contact?.name ||
                      detail.contact?.phone ||
                      'Conversa'}
                  </strong>
                  <p className="text-xs text-slate-500">
                    {detail.conversation.channel} ·{' '}
                    {statusLabels[detail.conversation.status]}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm font-semibold"
                    onClick={() =>
                      tenant &&
                      selected &&
                      action(() => assignInbox(tenant, selected))
                    }
                  >
                    Assumir
                  </button>
                  <button
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
                    onClick={() =>
                      tenant &&
                      selected &&
                      action(() => setInboxStatus(tenant, selected, 'closed'))
                    }
                  >
                    Fechar
                  </button>
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {detail.messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    Nenhuma mensagem.
                  </p>
                ) : (
                  detail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${m.direction === 'inbound' ? 'bg-white' : 'bg-blue-600 text-white'} ${m.direction === 'internal' ? 'ring-2 ring-amber-300' : ''}`}
                      >
                        <p>{m.body || 'Mídia registrada'}</p>
                        <time className="mt-1 block text-[10px] opacity-70">
                          {new Date(m.created_at).toLocaleString('pt-BR')}
                        </time>
                      </div>
                    </div>
                  ))
                )}
                {detail.attachments.map((a) => (
                  <a
                    key={a.id}
                    href={a.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border bg-white p-3 text-sm text-blue-700"
                  >
                    📎 {a.original_filename}
                  </a>
                ))}
              </div>
              <form
                className="flex gap-2 border-t bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tenant && selected && message.trim())
                    action(async () => {
                      await registerInboxMessage(tenant, selected, message);
                      setMessage('');
                    });
                }}
              >
                <label
                  className="cursor-pointer rounded-lg border p-2"
                  aria-label="Anexar arquivo"
                >
                  📎
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && tenant && selected)
                        void action(() =>
                          uploadInboxAttachment(tenant, selected, file),
                        );
                    }}
                  />
                </label>
                <input
                  aria-label="Mensagem"
                  className="flex-1 rounded-lg border p-2"
                  placeholder="Registrar mensagem"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button className="rounded-lg bg-blue-600 px-4 font-semibold text-white">
                  Enviar/Registrar
                </button>
              </form>
            </>
          )}
        </main>
        <aside className="space-y-5 border-l p-4">
          <section>
            <h2 className="font-bold">Contato</h2>
            <p className="mt-2 text-sm">
              {detail?.contact?.name || 'Não informado'}
            </p>
            <p className="text-sm text-slate-500">
              {detail?.contact?.phone || 'Sem telefone'}
            </p>
          </section>
          <section>
            <h2 className="font-bold">Resumo</h2>
            <p className="mt-2 text-sm text-slate-600">
              {detail?.conversation.summary || 'Sem resumo registrado.'}
            </p>
          </section>
          <section>
            <h2 className="font-bold">Ocorrências vinculadas</h2>
            <div className="mt-2 space-y-2">
              {detail?.occurrence_links.map((link) => (
                <Link
                  className="block rounded-lg border p-2 text-sm text-blue-700"
                  href={`/app/occurrences/${link.occurrence_id}`}
                  key={link.id}
                >
                  <strong>
                    {link.occurrence?.occurrence_number || 'Abrir ocorrência'}
                  </strong>
                  {link.occurrence && (
                    <span className="mt-1 block text-xs text-slate-600">
                      Status: {link.occurrence.current_status} · Prioridade:{' '}
                      {link.occurrence.current_priority}
                    </span>
                  )}
                  {link.occurrence?.latest_treatment && (
                    <span className="mt-1 block line-clamp-2 text-xs text-slate-500">
                      Última tratativa:{' '}
                      {link.occurrence.latest_treatment.description}
                    </span>
                  )}
                </Link>
              ))}
              {detail && detail.occurrence_links.length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhuma ocorrência vinculada.
                </p>
              )}
            </div>
          </section>
          <section className="space-y-2">
            <input
              aria-label="Buscar ocorrência"
              className="w-full rounded-lg border p-2 text-sm"
              placeholder="OC0000001 ou título"
              value={occurrenceSearch}
              onChange={(e) => setOccurrenceSearch(e.target.value)}
            />
            <button
              className="w-full rounded-lg border p-2 text-sm font-semibold"
              onClick={() => action(findOccurrences)}
            >
              Buscar para vincular
            </button>
            {occurrences.map((o) => (
              <button
                key={o.id}
                className="w-full rounded-lg bg-blue-50 p-2 text-left text-xs text-blue-800"
                onClick={() =>
                  tenant &&
                  selected &&
                  action(() => linkInboxOccurrence(tenant, selected, o.id))
                }
              >
                Vincular ocorrência {o.occurrence_number}
                <span className="block truncate">{o.title}</span>
              </button>
            ))}
            <Link
              href="/app/occurrences"
              className="block w-full rounded-lg bg-slate-900 p-2 text-center text-sm font-semibold text-white"
            >
              Criar ocorrência manual
            </Link>
            {detail?.occurrence_links.length ? (
              <Link
                href={`/app/occurrences/${detail.occurrence_links[detail.occurrence_links.length - 1].occurrence_id}`}
                className="block w-full rounded-lg border border-blue-600 p-2 text-center text-sm font-semibold text-blue-700"
              >
                Ver detalhes
              </Link>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
