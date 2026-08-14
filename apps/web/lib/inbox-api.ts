const tokenKey = 'sli_supabase_access_token';
const base = () =>
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001';
async function api<T>(path: string, init: RequestInit = {}) {
  const contentHeaders: Record<string, string> =
    init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${localStorage.getItem(tokenKey) ?? ''}`,
      ...contentHeaders,
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!response.ok)
    throw new Error(data?.message ?? 'Não foi possível concluir a operação.');
  return data as T;
}
export type InboxContact = {
  id: string;
  name: string | null;
  phone: string | null;
  email?: string | null;
  contact_type: string;
};
export type InboxConversation = {
  id: string;
  contact: InboxContact | null;
  channel: string;
  status: string;
  assigned_user_id: string | null;
  title: string | null;
  summary: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  occurrence_links_count: number;
  created_at: string;
};
export type InboxMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  sender_type: string;
  body: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  created_at: string;
};
export type InboxLink = {
  id: string;
  occurrence_id: string;
  relationship_type: string;
  created_at: string;
  occurrence?: {
    occurrence_number: string;
    current_status: string;
    current_priority: string;
    latest_treatment?: { description: string; created_at: string } | null;
  } | null;
};
export type InboxDetail = {
  conversation: Omit<
    InboxConversation,
    'contact' | 'last_message_preview' | 'occurrence_links_count'
  >;
  contact: InboxContact | null;
  messages: InboxMessage[];
  occurrence_links: InboxLink[];
  events: Array<{ id: string; event_title: string | null; created_at: string }>;
  attachments: Array<{
    id: string;
    message_id: string | null;
    original_filename: string;
    mime_type: string;
    download_url: string;
    created_at: string;
  }>;
};
export const listInbox = (tenant: string, params = new URLSearchParams()) =>
  api<InboxConversation[]>(`/tenants/${tenant}/inbox/conversations?${params}`);
export const inboxDetail = (tenant: string, id: string) =>
  api<InboxDetail>(`/tenants/${tenant}/inbox/conversations/${id}`);
export const registerInboxMessage = (
  tenant: string,
  id: string,
  body: string,
  direction: 'outbound' | 'internal' = 'outbound',
) =>
  api<InboxMessage>(`/tenants/${tenant}/inbox/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, direction, sender_type: 'user' }),
  });
export const uploadInboxAttachment = (
  tenant: string,
  id: string,
  file: File,
) => {
  const form = new FormData();
  form.append('file', file);
  return api<InboxDetail['attachments'][number]>(
    `/tenants/${tenant}/inbox/conversations/${id}/attachments`,
    { method: 'POST', body: form },
  );
};
export const assignInbox = (tenant: string, id: string) =>
  api(`/tenants/${tenant}/inbox/conversations/${id}/assign`, {
    method: 'PATCH',
    body: '{}',
  });
export const setInboxStatus = (tenant: string, id: string, status: string) =>
  api(`/tenants/${tenant}/inbox/conversations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
export const linkInboxOccurrence = (
  tenant: string,
  id: string,
  occurrence_id: string,
) =>
  api(`/tenants/${tenant}/inbox/conversations/${id}/occurrence-links`, {
    method: 'POST',
    body: JSON.stringify({ occurrence_id }),
  });
