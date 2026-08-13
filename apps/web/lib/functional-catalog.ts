export const functionalGroups = [
  'Operações',
  'Transporte',
  'Financeiro operacional',
  'Ocorrências operacionais',
  'Atendimento / Tickets e conversas',
  'Armazém',
  'Equipes',
  'Setup / Integrações',
  'Administração',
] as const;
const baseLabels: Record<string, string> = {
  operation_records: 'Operações',
  transport_records: 'Transporte',
  finance_records: 'Financeiro operacional',
  occurrence_analytics_view: 'Ocorrências operacionais',
  attendance_records: 'Atendimento / Tickets e conversas',
  warehouse_records: 'Armazém',
  team_records: 'Equipes',
};
const occurrenceFields = [
  'occurrence_number',
  'linked_document_number',
  'linked_invoice_number',
  'linked_cte_number',
  'linked_delivery_number',
  'opened_at',
  'due_at',
  'resolved_at',
  'closed_at',
  'resolution_minutes',
  'current_status',
  'current_priority',
  'sla_status',
  'source_channel',
  'reason_code',
  'reason_name',
  'reason_category',
  'responsible_team',
  'has_operation_link',
  'has_pending_actions',
  'pending_actions_count',
  'overdue_pending_actions_count',
  'treatments_count',
  'open_treatments_count',
  'documents_count',
  'attachments_count',
  'financial_entries_total',
];
export function functionalFamilyLabel(item: {
  base_table?: string;
  family_label?: string | null;
}) {
  return item.family_label || baseLabels[item.base_table || ''] || 'Operações';
}
export function functionalGroupOrder(item: {
  base_table?: string;
  family_label?: string | null;
}) {
  const i = functionalGroups.indexOf(
    functionalFamilyLabel(item) as (typeof functionalGroups)[number],
  );
  return i < 0 ? functionalGroups.length : i;
}
export function occurrenceFieldSortOrder(key: string) {
  const i = occurrenceFields.indexOf(key);
  return i < 0 ? occurrenceFields.length : i;
}
export function sortFunctionalCatalog<
  T extends {
    base_table?: string;
    family_label?: string | null;
    field_key?: string;
    sort_order?: number;
    label?: string;
    name?: string;
  },
>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      functionalGroupOrder(a) - functionalGroupOrder(b) ||
      (functionalFamilyLabel(a) === 'Ocorrências operacionais'
        ? occurrenceFieldSortOrder(a.field_key || '') -
          occurrenceFieldSortOrder(b.field_key || '')
        : (a.sort_order || 0) - (b.sort_order || 0)) ||
      String(a.label || a.name || '').localeCompare(
        String(b.label || b.name || ''),
        'pt-BR',
      ),
  );
}
