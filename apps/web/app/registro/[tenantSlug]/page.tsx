'use client';
import { FormEvent, useEffect, useState } from 'react';
import {
  ArrowLeft,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
} from 'lucide-react';
import { useParams } from 'next/navigation';

type Attachment = {
  id: string;
  original_filename: string;
  mime_type: string;
  download_url: string;
};
type Message = {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  created_at: string;
  status?: string;
  attachments?: Attachment[];
};
type Conversation = {
  conversation_id: string;
  title: string;
  last_message_preview: string;
  last_message_at: string;
  status: string;
  occurrence_number?: string;
};
const apiBase = () =>
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001';

export default function PublicAttendancePage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>(),
    [visitor, setVisitor] = useState(''),
    [sessionId, setSessionId] = useState(''),
    [sessionToken, setSessionToken] = useState(''),
    [messages, setMessages] = useState<Message[]>([]),
    [conversations, setConversations] = useState<Conversation[]>([]),
    [draft, setDraft] = useState(''),
    [search, setSearch] = useState(''),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false),
    [notice, setNotice] = useState(''),
    [mobileChat, setMobileChat] = useState(true),
    storageKey = `sli_public_chat_${tenantSlug}`;
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiBase()}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      }),
      data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        data.message ?? 'Não foi possível concluir o atendimento.',
      );
    return data;
  };
  const loadList = async (token = visitor, q = search) => {
    if (!token) return;
    const data = await request(
      `/public/${encodeURIComponent(tenantSlug)}/chat/conversations?token=${encodeURIComponent(token)}&search=${encodeURIComponent(q)}`,
    );
    setConversations(data.conversations);
  };
  useEffect(() => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      setVisitor(saved.visitor_token ?? '');
      setSessionId(saved.session_id ?? '');
      setSessionToken(saved.session_token ?? '');
      if (saved.session_id && saved.session_token)
        void request(
          `/public/${encodeURIComponent(tenantSlug)}/chat/session/${saved.session_id}?token=${encodeURIComponent(saved.session_token)}`,
        )
          .then((d) => setMessages(d.messages))
          .catch(() => localStorage.removeItem(storageKey));
      if (saved.visitor_token) void loadList(saved.visitor_token, '');
    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [tenantSlug]);
  useEffect(() => {
    if (!visitor) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      void loadList();
      if (sessionId && sessionToken)
        void request(
          `/public/${encodeURIComponent(tenantSlug)}/chat/session/${sessionId}?token=${encodeURIComponent(sessionToken)}`,
        ).then((d) =>
          setMessages((current) => {
            const optimistic = current.filter(
              (m) =>
                m.id.startsWith('optimistic-') &&
                !d.messages.some(
                  (saved: Message) =>
                    saved.direction === 'inbound' && saved.body === m.body,
                ),
            );
            return [...d.messages, ...optimistic];
          }),
        );
    }, 4000);
    return () => clearInterval(timer);
  }, [visitor, sessionId, sessionToken, search]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        direction: 'inbound',
        body: message,
        created_at: new Date().toISOString(),
        status: 'enviando',
      },
    ]);
    setDraft('');
    setBusy(true);
    setProcessing(true);
    setNotice('');
    try {
      let data;
      if (!sessionId)
        data = await request(
          `/public/${encodeURIComponent(tenantSlug)}/chat/start`,
          {
            method: 'POST',
            body: JSON.stringify({
              message,
              visitor_token: visitor || undefined,
            }),
          },
        );
      else
        data = await request(
          `/public/${encodeURIComponent(tenantSlug)}/chat/messages`,
          {
            method: 'POST',
            body: JSON.stringify({
              session_id: sessionId,
              session_token: sessionToken,
              message,
            }),
          },
        );
      const v = data.visitor_token ?? visitor,
        s = data.session_token ?? sessionToken;
      setVisitor(v);
      setSessionId(data.session_id);
      setSessionToken(s);
      setMessages(data.messages);
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          visitor_token: v,
          session_id: data.session_id,
          session_token: s,
          conversation_id: data.conversation_id,
        }),
      );
      await loadList(v, '');
    } catch (error) {
      setMessages((current) =>
        current.map((m) =>
          m.id === optimisticId ? { ...m, status: 'falhou' } : m,
        ),
      );
      setNotice(
        error instanceof Error
          ? error.message
          : 'Não consegui concluir o registro automático agora.',
      );
    } finally {
      setBusy(false);
      setProcessing(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file || !sessionId) return;
    const form = new FormData();
    form.append('file', file);
    form.append('session_id', sessionId);
    form.append('session_token', sessionToken);
    try {
      const response = await fetch(
          `${apiBase()}/public/${encodeURIComponent(tenantSlug)}/chat/attachments`,
          { method: 'POST', body: form },
        ),
        data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setMessages((current) => [
        ...current,
        {
          id: `attachment-${data.id}`,
          direction: 'inbound',
          body: null,
          created_at: data.created_at,
          attachments: [data],
        },
      ]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falha ao enviar arquivo.');
    }
  };
  const newConversation = () => {
    setSessionId('');
    setSessionToken('');
    setMessages([]);
    setDraft('');
    setNotice('');
    setMobileChat(true);
  };
  const openConversation = async (c: Conversation) => {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}'),
      data = await request(
        `/public/${encodeURIComponent(tenantSlug)}/chat/conversations/${encodeURIComponent(c.conversation_id)}?token=${encodeURIComponent(visitor)}`,
      );
    setMessages(data.messages);
    if (c.conversation_id === saved.conversation_id) {
      setSessionId(saved.session_id);
      setSessionToken(saved.session_token);
    } else {
      setSessionId('');
      setSessionToken('');
      setNotice(
        'Histórico protegido. Use Nova conversa para iniciar outro atendimento.',
      );
    }
    setMobileChat(true);
  };
  return (
    <main className="h-dvh bg-slate-100 text-slate-900">
      <div className="mx-auto grid h-full max-w-6xl md:grid-cols-[360px_1fr] md:p-4">
        <aside
          className={`${mobileChat ? 'hidden md:flex' : 'flex'} min-h-0 flex-col border-r bg-white md:rounded-l-2xl`}
        >
          <header className="border-b p-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-bold">Conversas</h1>
                <p className="text-xs text-slate-500">
                  Atendimento operacional seguro
                </p>
              </div>
              <button
                onClick={newConversation}
                className="rounded-full bg-blue-700 p-2 text-white"
                aria-label="Nova conversa"
              >
                <MessageSquarePlus />
              </button>
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-lg bg-slate-100 px-3">
              <Search size={17} />
              <input
                aria-label="Buscar conversas"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    void loadList(visitor, e.currentTarget.value);
                }}
                placeholder="Documento, NF, CT-e ou ocorrência"
                className="w-full bg-transparent py-2 outline-none"
              />
            </label>
          </header>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((c) => (
              <button
                key={c.conversation_id}
                onClick={() => void openConversation(c)}
                className="w-full border-b p-4 text-left hover:bg-slate-50"
              >
                <div className="flex justify-between gap-2">
                  <strong className="truncate">{c.title}</strong>
                  <time className="text-xs text-slate-400">
                    {c.last_message_at &&
                      new Date(c.last_message_at).toLocaleDateString('pt-BR')}
                  </time>
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {c.last_message_preview}
                </p>
                {c.occurrence_number && (
                  <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800">
                    {c.occurrence_number}
                  </span>
                )}
              </button>
            ))}
            {!conversations.length && (
              <p className="p-6 text-center text-sm text-slate-500">
                Nenhuma conversa neste dispositivo.
              </p>
            )}
          </div>
        </aside>
        <section
          aria-label="Chat de atendimento"
          className={`${mobileChat ? 'flex' : 'hidden md:flex'} min-h-0 flex-col bg-[#efeae2] md:rounded-r-2xl`}
        >
          <header className="flex items-center gap-3 bg-blue-700 p-4 text-white">
            <button
              aria-label="Voltar para conversas"
              className="md:hidden"
              onClick={() => setMobileChat(false)}
            >
              <ArrowLeft />
            </button>
            <div>
              <h2 className="font-semibold">AgentLog • Atendimento</h2>
              <p className="text-xs text-blue-100">
                Informe seus dados e a entrega durante a conversa.
              </p>
            </div>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && (
              <div className="mx-auto mt-10 max-w-sm rounded-xl bg-white/90 p-5 text-center shadow-sm">
                <h3 className="font-semibold">Como podemos ajudar?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Comece livremente. Se necessário, pediremos nome, telefone e
                  documento aqui no chat.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-xl px-4 py-3 text-sm shadow-sm ${m.direction === 'inbound' ? 'rounded-br-sm bg-[#d9fdd3]' : 'rounded-bl-sm bg-white'}`}
                >
                  {m.body}
                  {m.attachments?.map((a) => (
                    <a
                      key={a.id}
                      href={a.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block underline"
                    >
                      📎 {a.original_filename}
                    </a>
                  ))}
                  {m.status && (
                    <small className="mt-1 block text-slate-500">
                      {m.status}
                    </small>
                  )}
                </div>
              </div>
            ))}
            {processing && (
              <p className="text-sm text-slate-500" role="status">
                AgentLog está digitando...
              </p>
            )}
            {notice && (
              <p
                role="alert"
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                {notice}
              </p>
            )}
          </div>
          <form
            onSubmit={send}
            className="sticky bottom-0 flex gap-2 border-t bg-white p-3"
          >
            <label
              className={`rounded-full p-3 ${sessionId ? 'cursor-pointer text-blue-700' : 'text-slate-300'}`}
              aria-label="Anexar arquivo"
            >
              <Paperclip size={20} />
              <input
                type="file"
                className="hidden"
                disabled={!sessionId}
                accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.txt"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            <input
              aria-label="Digite sua mensagem"
              placeholder="Digite uma mensagem"
              maxLength={10000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-3 outline-none"
            />
            <button
              aria-label="Enviar"
              disabled={busy || !draft.trim()}
              className="rounded-full bg-blue-700 p-3 text-white disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
