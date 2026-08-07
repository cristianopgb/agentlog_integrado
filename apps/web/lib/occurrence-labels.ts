export const occurrenceStatusLabels = {
  draft: 'Rascunho',
  open: 'Aberta',
  triage: 'Triagem',
  in_progress: 'Em andamento',
  waiting_driver: 'Aguardando motorista',
  waiting_customer: 'Aguardando cliente',
  waiting_carrier: 'Aguardando transportadora',
  waiting_approval: 'Aguardando aprovação',
  waiting_document: 'Aguardando documento',
  waiting_payment: 'Aguardando pagamento',
  waiting_redelivery: 'Aguardando reentrega',
  waiting_return: 'Aguardando retorno',
  partially_resolved: 'Parcialmente resolvida',
  resolved: 'Resolvida',
  closed: 'Encerrada',
  canceled: 'Cancelada',
  reopened: 'Reaberta',
} as const;
export const occurrencePriorityLabels = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
} as const;
export const occurrenceStatusLabel = (value: string) =>
  occurrenceStatusLabels[value as keyof typeof occurrenceStatusLabels] ?? value;
export const occurrencePriorityLabel = (value: string) =>
  occurrencePriorityLabels[value as keyof typeof occurrencePriorityLabels] ??
  value;
