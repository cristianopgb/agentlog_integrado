'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Bot, History, MessageCircle, Mic, Plus, Send, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '../../lib/supabase';
import {
  chatConversations,
  chatMessages,
  chatSpeech,
  createChatConversation,
  deleteChatConversation,
  sendChatMessage,
} from '../../lib/chat-api';

type Message = { id: string; role: string; content: string; ai_run_id?: string };
type Conversation = { id: string; title?: string | null };

const ERROR = 'Não consegui responder agora. Tente novamente em instantes.';

const safeMessages = (value: unknown): Message[] =>
  Array.isArray(value)
    ? value.flatMap((item: any, index) =>
        typeof item?.content === 'string'
          ? [
              {
                id: item.id || `m-${index}`,
                role: item.role === 'user' ? 'user' : 'assistant',
                content: item.content,
                ai_run_id: item.ai_run_id,
              },
            ]
          : [],
      )
    : [];

const safeConversations = (value: unknown): Conversation[] =>
  Array.isArray(value)
    ? value
        .filter((item: any) => typeof item?.id === 'string')
        .map((item: any) => ({ id: item.id, title: item.title || null }))
    : [];

export function GlobalAgentChat() {
  const [open, setOpen] = useState(false);
  const [tenant, setTenant] = useState('');
  const [list, setList] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const refresh = async (tenantId: string) => {
    try {
      const response = await chatConversations(tenantId);
      setList(safeConversations(response.data));
    } catch {
      setList([]);
    }
  };

  useEffect(() => {
    const loadTenant = async () => {
      try {
        const { data: profile } = await createBrowserSupabaseClient()
          .from('users_profile')
          .select('active_tenant_id')
          .maybeSingle();
        const data = profile as { active_tenant_id?: string } | null;

        if (data?.active_tenant_id) {
          setTenant(data.active_tenant_id);
          await refresh(data.active_tenant_id);
        }
      } catch {
        // The chat stays closed until a tenant can be loaded.
      }
    };

    void loadTenant();
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const choose = async (item: Conversation) => {
    if (!tenant || !item.id) return;

    setConversation(item);
    setHistoryOpen(false);
    try {
      const response = await chatMessages(tenant, item.id);
      setMessages(safeMessages(response.data));
    } catch {
      setMessages([]);
    }
  };

  const fresh = async () => {
    if (!tenant) return;

    try {
      const response = await createChatConversation(tenant);
      const item = { id: response.id, title: response.title || null };
      setList((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      await choose(item);
    } catch {
      setMessages((current) => [
        ...current,
        { id: `e-${Date.now()}`, role: 'assistant', content: ERROR },
      ]);
    }
  };

  const openChat = () => {
    setOpen(true);
    if (!conversation) {
      void fresh();
    }
  };

  const send = async () => {
    if (!tenant || !conversation?.id || !text.trim() || loading) return;

    const question = text.trim();
    const conversationId = conversation.id;
    setText('');
    setMessages((current) => [
      ...current,
      { id: `local-${Date.now()}`, role: 'user', content: question },
    ]);
    setLoading(true);

    try {
      const response = await sendChatMessage(tenant, conversationId, question);
      setMessages((current) => [
        ...current,
        ...safeMessages(response.message ? [response.message] : []),
      ]);
      await refresh(tenant);
    } catch {
      setMessages((current) => [
        ...current,
        { id: `e-${Date.now()}`, role: 'assistant', content: ERROR },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const playSpeech = async (message: Message) => {
    if (!tenant) return;

    try {
      const response = await chatSpeech(tenant, message.content, message.ai_run_id);
      const audio = new Audio(
        `data:${response.audio_mime_type || 'audio/mpeg'};base64,${response.audio_base64}`,
      );
      await audio.play();
    } catch {
      setMessages((current) => [
        ...current,
        { id: `e-${Date.now()}`, role: 'assistant', content: 'Não foi possível reproduzir a resposta.' },
      ]);
    }
  };

  const remove = async (item: Conversation) => {
    if (!tenant || !item.id || !confirm(`Excluir a conversa “${item.title || 'sem título'}”?`)) return;

    try {
      await deleteChatConversation(tenant, item.id);
      const next = list.filter((entry) => entry.id !== item.id);
      setList(next);

      if (conversation?.id === item.id) {
        setConversation(undefined);
        setMessages([]);
        if (next[0]) {
          await choose(next[0]);
        } else {
          await fresh();
        }
      }
    } catch {
      setMessages((current) => [
        ...current,
        { id: `e-${Date.now()}`, role: 'assistant', content: 'Não foi possível excluir esta conversa.' },
      ]);
    }
  };

  return (
    <>
      <button
        onClick={openChat}
        aria-label="Abrir chat geral"
        className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
      >
        <MessageCircle />
      </button>

      {open && (
        <section aria-label="Agente geral" className="fixed bottom-5 right-5 z-40 flex h-[min(680px,calc(100vh-2.5rem))] w-[calc(100vw-2.5rem)] max-w-[410px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700"><Bot size={21} /></span>
              <div><h2 className="font-semibold">Agente geral</h2><p className="text-xs text-emerald-700">IA ativa</p></div>
            </div>
            <div>
              <button aria-label="Histórico" onClick={() => setHistoryOpen((current) => !current)} className="rounded-full p-2"><History size={18} /></button>
              <button aria-label="Fechar chat" onClick={() => setOpen(false)} className="rounded-full p-2"><X size={19} /></button>
            </div>
          </header>

          {historyOpen && (
            <div className="absolute right-3 top-16 z-10 w-64 rounded-2xl border bg-white p-2 shadow-xl">
              <button onClick={() => void fresh()} className="flex w-full gap-2 rounded-xl px-3 py-2 text-left text-sm text-blue-700"><Plus size={16} />Nova conversa</button>
              <div className="max-h-48 overflow-y-auto border-t">
                {list.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <button onClick={() => void choose(item)} className="min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm">{item.title || 'Conversa sem título'}</button>
                    <button aria-label="Excluir conversa" onClick={() => void remove(item)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <main className="flex-1 space-y-3 overflow-y-auto bg-slate-50/80 p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>
                  {message.content}
                  {message.role === 'assistant' && <button aria-label="Ouvir resposta" onClick={() => void playSpeech(message)} className="ml-2 text-blue-600"><Volume2 size={15} /></button>}
                </div>
              </div>
            ))}
            {loading && <p className="text-sm text-slate-500">Agente está respondendo...</p>}
            <div ref={end} />
          </main>

          <footer className="border-t bg-white p-3">
            <form className="flex items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
              <textarea aria-label="Mensagem" placeholder="Digite sua mensagem..." className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border bg-slate-50 px-3 py-2 text-sm" value={text} onChange={(event) => setText(event.target.value)} disabled={!conversation || loading} />
              <button type="button" aria-label="Voz em tempo real indisponível" title="Voz em tempo real temporariamente indisponível." className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-slate-400" disabled><Mic size={18} /></button>
              <button aria-label="Enviar mensagem" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white" disabled={!conversation || loading || !text.trim()}><Send size={17} /></button>
            </form>
          </footer>
        </section>
      )}
    </>
  );
}
