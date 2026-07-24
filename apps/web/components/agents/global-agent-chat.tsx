'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { tool } from '@openai/agents';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import {
  Bot,
  History,
  MessageCircle,
  Mic,
  Plus,
  Send,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createBrowserSupabaseClient } from '../../lib/supabase';
import {
  chatConversations,
  chatMessages,
  chatSpeech,
  createChatConversation,
  deleteChatConversation,
  realtimeEvent,
  realtimeSession,
  realtimeTool,
  sendChatMessage,
} from '../../lib/chat-api';

type Message = {
  id: string;
  role: string;
  content: string;
  ai_run_id?: string;
};
type Conversation = { id: string; title?: string | null };
type VoiceState = 'idle' | 'connecting' | 'listening' | 'responding' | 'error';
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
const optionalObject = z.record(z.string(), z.unknown()).optional();

function VoiceWaves({ state }: { state: VoiceState }) {
  return (
    <div
      className="flex h-12 items-center justify-center gap-1"
      aria-hidden="true"
    >
      {[16, 28, 40, 28, 16].map((height, index) => (
        <i
          key={`${height}-${index}`}
          className={`w-1.5 rounded-full bg-blue-500 ${state === 'listening' || state === 'responding' ? 'animate-pulse' : ''}`}
          style={{ height, animationDelay: `${index * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function GlobalAgentChat() {
  const [open, setOpen] = useState(false),
    [tenant, setTenant] = useState(''),
    [list, setList] = useState<Conversation[]>([]),
    [conversation, setConversation] = useState<Conversation>(),
    [messages, setMessages] = useState<Message[]>([]),
    [text, setText] = useState(''),
    [loading, setLoading] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false),
    [voice, setVoice] = useState<VoiceState>('idle'),
    [voiceError, setVoiceError] = useState('');
  const end = useRef<HTMLDivElement>(null),
    voiceSession = useRef<RealtimeSession | null>(null),
    run = useRef(''),
    lastPersistedTranscript = useRef('');
  const refresh = async (tenantId: string) => {
    try {
      setList(safeConversations((await chatConversations(tenantId)).data));
    } catch {
      setList([]);
    }
  };
  const cleanupVoice = () => {
    try {
      voiceSession.current?.close();
    } catch {
      /* SDK cleanup is isolated from typed chat. */
    } finally {
      voiceSession.current = null;
    }
  };

  useEffect(() => {
    const loadTenant = async () => {
      try {
        const { data } = await createBrowserSupabaseClient()
          .from('users_profile')
          .select('active_tenant_id')
          .maybeSingle();
        const profile = data as { active_tenant_id?: string } | null;
        if (profile?.active_tenant_id) {
          setTenant(profile.active_tenant_id);
          await refresh(profile.active_tenant_id);
        }
      } catch {
        /* Chat stays closed until tenant is loaded. */
      }
    };
    void loadTenant().catch(() => undefined);
    return cleanupVoice;
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);
  const choose = async (item: Conversation) => {
    if (!tenant || !item.id) return;
    setConversation(item);
    setHistoryOpen(false);
    try {
      setMessages(safeMessages((await chatMessages(tenant, item.id)).data));
    } catch {
      setMessages([]);
    }
  };
  const fresh = async () => {
    if (!tenant) return;
    try {
      const response = await createChatConversation(tenant);
      const item = { id: response.id, title: response.title || null };
      setList((current) => [
        item,
        ...current.filter((entry) => entry.id !== item.id),
      ]);
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
    if (!conversation) void fresh().catch(() => undefined);
  };
  const send = async () => {
    if (!tenant || !conversation?.id || !text.trim() || loading) return;
    const question = text.trim(),
      conversationId = conversation.id;
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
      const response = await chatSpeech(
        tenant,
        message.content,
        message.ai_run_id,
      );
      await new Audio(
        `data:${response.audio_mime_type || 'audio/mpeg'};base64,${response.audio_base64}`,
      ).play();
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'Não foi possível reproduzir a resposta.',
        },
      ]);
    }
  };
  const persist = async (
    conversationId: string,
    stage: string,
    eventText?: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!tenant || !conversationId || !run.current) return;
    await realtimeEvent(tenant, conversationId, {
      stage,
      text: eventText,
      ai_run_id: run.current,
      ...extra,
    });
  };
  const refreshConversation = async (conversationId: string) => {
    await refresh(tenant);
    if (conversation?.id === conversationId) await choose(conversation);
  };
  const failVoice = async (conversationId: string, message: string) => {
    cleanupVoice();
    setVoice('error');
    setVoiceError(message);
    if (!run.current) return;
    try {
      await persist(conversationId, 'failed', undefined, {
        error_code: 'voice_connection_failed',
        error_message_safe: message,
      });
    } catch {
      /* Failure logging cannot reject into React. */
    }
  };
  const realtimeProxy = <T extends z.ZodTypeAny>(
    name: string,
    description: string,
    parameters: T,
    conversationId: string,
  ) =>
    tool({
      name,
      description,
      parameters,
      execute: async (args: z.infer<T>) => {
        try {
          const response = await realtimeTool(tenant, conversationId, {
            ai_run_id: run.current,
            name,
            arguments: args,
          });
          return response.result;
        } catch {
          return {
            tool_error: true,
            error_code: 'INVALID_TOOL_ARGUMENTS',
            message: 'Parâmetros inválidos para esta ferramenta.',
            retry_instruction:
              'Refaça a chamada usando somente o schema permitido.',
          };
        }
      },
    });
  const startVoice = async () => {
    const conversationId = conversation?.id;
    if (
      !tenant ||
      !conversationId ||
      loading ||
      voice === 'connecting' ||
      voice === 'listening' ||
      voice === 'responding'
    )
      return;
    run.current = '';
    setVoice('connecting');
    setVoiceError('');
    try {
      const response = await realtimeSession(tenant, conversationId),
        clientSecret =
          typeof response?.client_secret === 'string'
            ? response.client_secret
            : '',
        runId =
          typeof response?.ai_run_id === 'string' ? response.ai_run_id : '',
        model = typeof response?.model === 'string' ? response.model : '',
        instructions =
          typeof response?.instructions === 'string'
            ? response.instructions
            : 'Responda em português do Brasil de forma segura e objetiva.';
      if (!clientSecret || !runId || !model)
        throw new Error('voice_session_invalid');
      run.current = runId;
      lastPersistedTranscript.current = '';
      const tools = [
        realtimeProxy(
          'analytics_map_get',
          'Descobre resultados, indicadores, dashboards e relatórios configurados antes de consultas não mapeadas.',
          z.object({ search: z.string().optional() }),
          conversationId,
        ),
        realtimeProxy(
          'analytics_result_get',
          'Consulta métrica, ranking ou distribuição da base canônica. Exemplo: “qual peso total” usa metric_key peso_total; “rota com maior custo de frete” usa frete_total com breakdown_by route.',
          z.object({
            result_key: z.string().optional(),
            metric_key: z
              .enum([
                'frete_total',
                'frete_medio',
                'peso_total',
                'volume_total',
                'total_entregas',
                'entregas_atrasadas',
                'entregas_canceladas',
              ])
              .optional(),
            breakdown_by: z
              .enum([
                'status',
                'customer_name',
                'shipper_name',
                'driver_name',
                'vehicle_plate',
                'route',
                'origin',
                'destination',
              ])
              .optional(),
            filters: z
              .object({
                customer_name: z.string().optional(),
                shipper_name: z.string().optional(),
                driver_name: z.string().optional(),
                vehicle_plate: z.string().optional(),
                status: z.string().optional(),
                origin_state: z.string().optional(),
                origin_city: z.string().optional(),
                destination_state: z.string().optional(),
                destination_city: z.string().optional(),
              })
              .optional(),
            period: optionalObject,
          }),
          conversationId,
        ),
        realtimeProxy(
          'analytics_context_analyze',
          'Analisa fatos de dashboard, relatório ou entidade claramente definida; use operation somente para visão geral solicitada.',
          z.object({
            context_type: z.enum([
              'dashboard',
              'report',
              'customer',
              'driver',
              'vehicle_plate',
              'shipper',
              'operation',
            ]),
            context_value: z.string().optional(),
            period: optionalObject,
          }),
          conversationId,
        ),
        realtimeProxy(
          'operational_record_find',
          'Localiza registro vigente específico. Para “status do manifesto MAN-7001”, use identifier_type manifest_number e identifier_value MAN-7001.',
          z.object({
            identifier_type: z
              .enum([
                'delivery_number',
                'cte_number',
                'invoice_number',
                'manifest_number',
                'vehicle_plate',
              ])
              .optional(),
            identifier_value: z.string().optional(),
            filters: optionalObject,
            period: optionalObject,
            limit: z.number().int().min(1).max(5).optional(),
          }),
          conversationId,
        ),
        realtimeProxy(
          'knowledge_guidance_search',
          'Busca orientação funcional publicada quando não houver resultado configurado ou para dúvidas de uso e processo.',
          z.object({
            topic: z.string(),
            user_question: z.string(),
            limit: z.number().int().min(1).max(5).optional(),
          }),
          conversationId,
        ),
      ];
      const agent = new RealtimeAgent({
        name: 'Chat Geral',
        instructions,
        tools,
      });
      const sdkSession = new RealtimeSession(agent, { model });
      voiceSession.current = sdkSession;
      sdkSession.on('history_updated', (history: any[]) => {
        const latest = Array.isArray(history)
            ? history[history.length - 1]
            : null,
          transcript =
            typeof latest?.content === 'string'
              ? latest.content
              : typeof latest?.transcript === 'string'
                ? latest.transcript
                : '';
        if (latest?.role !== 'user' && latest?.role !== 'assistant') return;
        if (latest.role === 'assistant' && !transcript) return;
        const transcriptKey = `${latest.role}:${transcript}`;
        if (lastPersistedTranscript.current === transcriptKey) return;
        lastPersistedTranscript.current = transcriptKey;
        if (latest.role === 'user') {
          void persist(
            conversationId,
            'user_spoke',
            transcript || undefined,
          ).catch(() => undefined);
          return;
        }
        setVoice('responding');
        void persist(conversationId, 'responded', transcript)
          .then(() => refreshConversation(conversationId))
          .catch(() => undefined);
      });
      sdkSession.on('error', () => {
        void failVoice(conversationId, 'Erro ao conectar voz');
      });
      await sdkSession.connect({ apiKey: clientSecret });
      setVoice('listening');
      await persist(conversationId, 'connected');
    } catch (cause) {
      await failVoice(
        conversationId,
        cause instanceof DOMException
          ? 'Permita o acesso ao microfone para conversar por voz.'
          : 'Erro ao conectar voz',
      );
    }
  };
  const stopVoiceSession = async () => {
    const conversationId = conversation?.id,
      shouldEnd = voice !== 'error' && Boolean(run.current && conversationId);
    cleanupVoice();
    try {
      if (shouldEnd && conversationId) {
        await persist(conversationId, 'ended');
        await refreshConversation(conversationId);
      }
    } catch {
      /* The compact card can always close. */
    } finally {
      run.current = '';
      setVoiceError('');
      setVoice('idle');
    }
  };
  const remove = async (item: Conversation) => {
    if (
      !tenant ||
      !item.id ||
      !confirm(`Excluir a conversa “${item.title || 'sem título'}”?`)
    )
      return;
    try {
      await deleteChatConversation(tenant, item.id);
      const next = list.filter((entry) => entry.id !== item.id);
      setList(next);
      if (conversation?.id === item.id) {
        setConversation(undefined);
        setMessages([]);
        if (next[0]) await choose(next[0]);
        else await fresh();
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: 'Não foi possível excluir esta conversa.',
        },
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
        <section
          aria-label="Agente geral"
          className="fixed bottom-5 right-5 z-40 flex h-[min(680px,calc(100vh-2.5rem))] w-[calc(100vw-2.5rem)] max-w-[410px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Bot size={21} />
              </span>
              <div>
                <h2 className="font-semibold">Agente geral</h2>
                <p className="text-xs text-emerald-700">IA ativa</p>
              </div>
            </div>
            <div>
              <button
                aria-label="Histórico"
                onClick={() => setHistoryOpen((current) => !current)}
                className="rounded-full p-2"
              >
                <History size={18} />
              </button>
              <button
                aria-label="Fechar chat"
                onClick={() => {
                  void stopVoiceSession().catch(() => undefined);
                  setOpen(false);
                }}
                className="rounded-full p-2"
              >
                <X size={19} />
              </button>
            </div>
          </header>
          {historyOpen && (
            <div className="absolute right-3 top-16 z-10 w-64 rounded-2xl border bg-white p-2 shadow-xl">
              <button
                onClick={() => {
                  void fresh().catch(() => undefined);
                }}
                className="flex w-full gap-2 rounded-xl px-3 py-2 text-left text-sm text-blue-700"
              >
                <Plus size={16} />
                Nova conversa
              </button>
              <div className="max-h-48 overflow-y-auto border-t">
                {list.map((item) => (
                  <div key={item.id} className="flex items-center">
                    <button
                      onClick={() => {
                        void choose(item).catch(() => undefined);
                      }}
                      className="min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm"
                    >
                      {item.title || 'Conversa sem título'}
                    </button>
                    <button
                      aria-label="Excluir conversa"
                      onClick={() => {
                        void remove(item).catch(() => undefined);
                      }}
                      className="p-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <main className="flex-1 space-y-3 overflow-y-auto bg-slate-50/80 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 shadow-sm'}`}
                >
                  {message.content}
                  {message.role === 'assistant' && (
                    <button
                      aria-label="Ouvir resposta"
                      onClick={() => {
                        void playSpeech(message).catch(() => undefined);
                      }}
                      className="ml-2 text-blue-600"
                    >
                      <Volume2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <p className="text-sm text-slate-500">
                Agente está respondendo...
              </p>
            )}
            <div ref={end} />
          </main>
          <footer className="border-t bg-white p-3">
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send().catch(() => undefined);
              }}
            >
              <textarea
                aria-label="Mensagem"
                placeholder="Digite sua mensagem..."
                className="max-h-24 min-h-10 flex-1 resize-none rounded-2xl border bg-slate-50 px-3 py-2 text-sm"
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={!conversation || loading}
              />
              <button
                type="button"
                aria-label="Abrir voz em tempo real"
                title="Conversar por voz"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-blue-700 disabled:text-slate-400"
                disabled={
                  !conversation ||
                  loading ||
                  voice === 'connecting' ||
                  voice === 'listening' ||
                  voice === 'responding'
                }
                onClick={() => {
                  void startVoice().catch(() => undefined);
                }}
              >
                <Mic size={18} />
              </button>
              <button
                aria-label="Enviar mensagem"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                disabled={!conversation || loading || !text.trim()}
              >
                <Send size={17} />
              </button>
            </form>
            {voice !== 'idle' && (
              <section
                role="dialog"
                aria-label="Voz em tempo real"
                className="absolute inset-x-4 bottom-20 z-20 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-xl"
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <Bot size={18} />
                  </span>
                  <h2 className="font-semibold">Agente geral</h2>
                </div>
                <VoiceWaves state={voice} />
                <p className="text-sm font-medium text-slate-700">
                  {voice === 'connecting'
                    ? 'Conectando voz...'
                    : voice === 'listening'
                      ? 'Ouvindo...'
                      : voice === 'responding'
                        ? 'Respondendo...'
                        : 'Erro ao conectar voz'}
                </p>
                {voiceError && (
                  <p className="mt-2 text-sm text-red-700">{voiceError}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void stopVoiceSession().catch(() => undefined);
                  }}
                  className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  {voice === 'error' ? 'Fechar' : 'Encerrar voz'}
                </button>
              </section>
            )}
          </footer>
        </section>
      )}
    </>
  );
}
