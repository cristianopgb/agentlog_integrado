const tokenKey = 'sli_supabase_access_token';
const base = () =>
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  'http://localhost:3001';
async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${localStorage.getItem(tokenKey) ?? ''}`,
      'Content-Type': 'application/json',
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
export type OperationLink = {
  id: string;
  operation_record_id: string;
  is_primary: boolean;
  relationship_type: string;
  snapshot?: Record<string, unknown>;
};
export type OperationOption = {
  id: string;
  label: string;
  subtitle?: string;
  document_number?: string | null;
  customer_name?: string | null;
  reference?: string | null;
};
export type OccurrenceEvent = {
  id: string;
  reason_id?: string;
  event_type: string;
  event_title: string | null;
  event_description: string | null;
  event_at: string;
  old_status: string | null;
  new_status: string | null;
};
export type OccurrenceReason = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  is_active: boolean;
};
export type ReasonRequirement = {
  id: string;
  field_key: string;
  stage: 'opening' | 'update' | 'resolution' | 'closing';
  is_required: boolean;
};
export type Occurrence = {
  id: string;
  occurrence_number: string;
  title: string;
  description: string | null;
  current_status: string;
  current_priority: string;
  source_channel: string;
  current_owner_id: string | null;
  opened_at: string;
  operation_links?: OperationLink[];
  events?: OccurrenceEvent[];
};
export const listOccurrences = (
  tenant: string,
  params = new URLSearchParams(),
) => api<Occurrence[]>(`/tenants/${tenant}/occurrences?${params}`);
export const occurrenceDetail = (tenant: string, id: string) =>
  api<Occurrence>(`/tenants/${tenant}/occurrences/${id}`);
export const occurrenceKanban = (tenant: string) =>
  api<Array<{ status: string; items: Occurrence[] }>>(
    `/tenants/${tenant}/occurrences/kanban`,
  );
export const changeOccurrenceStatus = (
  tenant: string,
  id: string,
  status: string,
) =>
  api<Occurrence>(`/tenants/${tenant}/occurrences/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
export const assignOccurrence = (
  tenant: string,
  id: string,
  owner_id: string | null,
) =>
  api<Occurrence>(`/tenants/${tenant}/occurrences/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ owner_id }),
  });
export const listOccurrenceReasons = (tenant: string) =>
  api<OccurrenceReason[]>(`/tenants/${tenant}/occurrences/reasons`);
export const reasonRequirements = (
  tenant: string,
  reason: string,
  stage: string,
) =>
  api<ReasonRequirement[]>(
    `/tenants/${tenant}/occurrences/reasons/${reason}/requirements?stage=${stage}`,
  );
export const createOccurrence = (
  tenant: string,
  payload: Record<string, unknown>,
) =>
  api<Occurrence>(`/tenants/${tenant}/occurrences`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const addOccurrenceEvent = (
  tenant: string,
  id: string,
  payload: Record<string, unknown>,
) =>
  api<OccurrenceEvent[]>(`/tenants/${tenant}/occurrences/${id}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const operationOptions = (tenant: string, search: string) =>
  api<OperationOption[]>(
    `/tenants/${tenant}/occurrences/operation-options?search=${encodeURIComponent(search)}`,
  );
export const addOperationLink = (
  tenant: string,
  id: string,
  payload: Record<string, unknown>,
) =>
  api<OperationLink[]>(`/tenants/${tenant}/occurrences/${id}/operation-links`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
export const removeOperationLink = (
  tenant: string,
  id: string,
  linkId: string,
) =>
  api<{ deleted: boolean }>(
    `/tenants/${tenant}/occurrences/${id}/operation-links/${linkId}`,
    { method: 'DELETE' },
  );
