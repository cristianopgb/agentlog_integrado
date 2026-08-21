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
export type OccurrenceRecord = Record<string, unknown> & {
  id: string;
  created_at: string;
};
export type OccurrenceItem = OccurrenceRecord & {
  item_type: string;
  sku?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount?: number | null;
  notes?: string | null;
};
export type OccurrenceFinancialEntry = OccurrenceRecord & {
  entry_type: string;
  status: string;
  amount: number;
  description?: string | null;
  due_at?: string | null;
  notes?: string | null;
};
export type OccurrenceDocument = OccurrenceRecord & {
  document_type: string;
  document_number?: string | null;
  document_key?: string | null;
  amount?: number | null;
  issued_at?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  notes?: string | null;
};
export type OccurrenceAttachment = OccurrenceRecord & {
  attachment_type: string;
  file_name?: string | null;
  storage_path?: string | null;
  external_url?: string | null;
  description?: string | null;
};
export type OccurrenceTreatment = OccurrenceRecord & {
  treatment_type: string;
  description: string;
  responsible_team?: string | null;
  status: string;
  completed_at?: string | null;
};
export type OccurrencePendingAction = OccurrenceRecord & {
  title: string;
  description?: string | null;
  responsible_team?: string | null;
  due_at?: string | null;
  status: string;
  completed_at?: string | null;
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
  items?: OccurrenceItem[];
  financial_entries?: OccurrenceFinancialEntry[];
  documents?: OccurrenceDocument[];
  attachments?: OccurrenceAttachment[];
  treatments?: OccurrenceTreatment[];
  pending_actions?: OccurrencePendingAction[];
  due_at?: string | null;
  sla_status?: string;
  resolution_summary?: string | null;
  closed_reason?: string | null;
  closed_notes?: string | null;
  operation_record_id?: string | null;
  operation_delivery_number?: string | null;
  operation_document_number?: string | null;
  operation_invoice_number?: string | null;
  operation_cte_number?: string | null;
  operation_manifest_number?: string | null;
  operation_order_number?: string | null;
  operation_customer_name?: string | null;
  last_treatment_description?: string | null;
  last_treatment_at?: string | null;
  last_treatment_type?: string | null;
};
export const occurrenceTreatmentTypeLabels: Record<string, string> = {
  contact_driver: 'Contato com motorista',
  contact_customer: 'Contato com cliente',
  contact_shipper: 'Contato com embarcador',
  contact_recipient: 'Contato com destinatário',
  internal_analysis: 'Análise interna',
  request_document: 'Solicitação de documento',
  request_authorization: 'Solicitação de autorização',
  schedule_redelivery: 'Agendar reentrega',
  confirm_return: 'Confirmar devolução',
  financial_validation: 'Validação financeira',
  operational_action: 'Ação operacional',
  other: 'Outro',
};
export const occurrenceTreatmentStatusLabels: Record<string, string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  done: 'Concluída',
  canceled: 'Cancelada',
};
export const occurrencePendingStatusLabels: Record<string, string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  done: 'Concluída',
  canceled: 'Cancelada',
};
export const occurrenceSlaLabels: Record<string, string> = {
  not_started: 'Não definido',
  on_track: 'No prazo',
  overdue: 'Em atraso',
  met: 'Cumprido',
  breached: 'Vencido',
  not_applicable: 'Não aplicável',
};
export const occurrenceItemLabels = {
  missing: 'Falta',
  extra: 'Sobra',
  damaged: 'Avaria',
  returned: 'Devolução',
  inverted: 'Inversão',
  divergent: 'Divergência',
  other: 'Outro',
} as const;
export const occurrenceFinancialTypeLabels = {
  unloading: 'Descarga',
  daily: 'Diária',
  layover: 'Estadia',
  helper: 'Ajudante',
  scheduling_fee: 'Taxa de agendamento',
  additional_fee: 'Taxa adicional',
  refund: 'Reembolso',
  return_cost: 'Custo de devolução',
  other: 'Outro',
} as const;
export const occurrenceFinancialStatusLabels = {
  requested: 'Solicitado',
  approved: 'Aprovado',
  rejected: 'Recusado',
  paid: 'Pago',
  canceled: 'Cancelado',
} as const;
export const occurrenceDocumentLabels = {
  original_invoice: 'Nota fiscal original',
  return_invoice: 'Nota fiscal de devolução',
  cte: 'CT-e',
  mdfe: 'MDF-e',
  proof_of_delivery: 'Comprovante de entrega',
  unloading_receipt: 'Comprovante de descarga',
  fiscal_document: 'Documento fiscal',
  occurrence_report: 'Relatório da ocorrência',
  other: 'Outro',
} as const;
export const occurrenceAttachmentLabels = {
  photo: 'Foto',
  audio: 'Áudio',
  video: 'Vídeo',
  pdf: 'PDF',
  image: 'Imagem',
  document: 'Documento',
  other: 'Outro',
} as const;
export const occurrenceEventLabels: Record<string, string> = {
  created: 'Ocorrência criada',
  note: 'Atualização operacional',
  reported: 'Ocorrência reportada',
  status_changed: 'Status alterado',
  assigned: 'Responsável alterado',
  operation_linked: 'Operação vinculada',
  operation_unlinked: 'Operação desvinculada',
  item_added: 'Item adicionado',
  item_updated: 'Item atualizado',
  item_removed: 'Item removido',
  financial_entry_added: 'Valor/despesa adicionada',
  financial_entry_updated: 'Valor/despesa atualizada',
  financial_entry_removed: 'Valor/despesa removida',
  document_added: 'Documento adicionado',
  document_updated: 'Documento atualizado',
  document_removed: 'Documento removido',
  attachment_added: 'Evidência adicionada',
  attachment_removed: 'Evidência removida',
  treatment_added: 'Tratativa adicionada',
  treatment_updated: 'Tratativa atualizada',
  treatment_completed: 'Tratativa concluída',
  treatment_removed: 'Tratativa removida',
  pending_action_added: 'Pendência adicionada',
  pending_action_updated: 'Pendência atualizada',
  pending_action_completed: 'Pendência concluída',
  pending_action_removed: 'Pendência removida',
  sla_updated: 'SLA atualizado',
  occurrence_resolved: 'Ocorrência resolvida',
  occurrence_closed: 'Ocorrência encerrada',
  occurrence_finalized: 'Ocorrência finalizada',
};
const resourceApi = <T>(resource: string) => ({
  list: (t: string, o: string) =>
    api<T[]>(`/tenants/${t}/occurrences/${o}/${resource}`),
  create: (t: string, o: string, p: Record<string, unknown>) =>
    api<T>(`/tenants/${t}/occurrences/${o}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  update: (t: string, o: string, id: string, p: Record<string, unknown>) =>
    api<T>(`/tenants/${t}/occurrences/${o}/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(p),
    }),
  remove: (t: string, o: string, id: string) =>
    api<{ deleted: boolean }>(
      `/tenants/${t}/occurrences/${o}/${resource}/${id}`,
      { method: 'DELETE' },
    ),
});
export const occurrenceItemsApi = resourceApi<OccurrenceItem>('items');
export const occurrenceFinancialEntriesApi =
  resourceApi<OccurrenceFinancialEntry>('financial-entries');
export const occurrenceDocumentsApi =
  resourceApi<OccurrenceDocument>('documents');
export const occurrenceAttachmentsApi =
  resourceApi<OccurrenceAttachment>('attachments');
export const occurrenceTreatmentsApi =
  resourceApi<OccurrenceTreatment>('treatments');
export const occurrencePendingActionsApi =
  resourceApi<OccurrencePendingAction>('pending-actions');
export const updateOccurrenceSla = (
  t: string,
  o: string,
  p: { due_at: string | null },
) =>
  api<Occurrence>(`/tenants/${t}/occurrences/${o}/sla`, {
    method: 'PATCH',
    body: JSON.stringify(p),
  });
export const resolveOccurrence = (
  t: string,
  o: string,
  resolution_summary: string,
) =>
  api<Occurrence>(`/tenants/${t}/occurrences/${o}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({ resolution_summary }),
  });
export const closeOccurrence = (
  t: string,
  o: string,
  p: {
    closed_reason: string;
    closed_notes?: string;
    force_close_with_pending?: boolean;
  },
) =>
  api<Occurrence>(`/tenants/${t}/occurrences/${o}/close`, {
    method: 'PATCH',
    body: JSON.stringify(p),
  });
export type OccurrenceCode = {
  id: string;
  code: string;
  description: string;
  kind: 'reason' | 'closure';
};
export const listOccurrenceCodes = (
  t: string,
  kind: 'reason' | 'closure',
  search = '',
) =>
  api<OccurrenceCode[]>(
    `/tenants/${t}/occurrences/codes?kind=${kind}&search=${encodeURIComponent(search)}`,
  );
export const finalizeOccurrence = (
  t: string,
  o: string,
  p: {
    closure_code_id?: string;
    closure_code?: string;
    closed_notes?: string;
    force_close_with_pending?: boolean;
  },
) =>
  api<Occurrence>(`/tenants/${t}/occurrences/${o}/finalize`, {
    method: 'PATCH',
    body: JSON.stringify(p),
  });
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
    `/tenants/${tenant}/occurrences/operation-options?search=${encodeURIComponent(search)}&limit=20`,
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
