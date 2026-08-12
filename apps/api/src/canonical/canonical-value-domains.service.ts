import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type CanonicalAllowedValue = {
  value: string;
  label: string;
  sort_order: number;
};

const values = (...items: Array<[string, string]>): CanonicalAllowedValue[] =>
  items.map(([value, label], sort_order) => ({ value, label, sort_order }));

const DOMAINS: Record<string, CanonicalAllowedValue[]> = {
  'operation_records.delivery_status': values(['pending','Pendente'],['scheduled','Agendada'],['in_transit','Em trânsito'],['delivered','Entregue'],['delayed','Atrasada'],['failed','Falha'],['canceled','Cancelada']),
  'operation_records.status': values(['pending','Pendente'],['active','Ativa'],['completed','Concluída'],['blocked','Bloqueada'],['canceled','Cancelada']),
  'operation_records.priority': values(['low','Baixa'],['normal','Normal'],['high','Alta'],['urgent','Urgente']),
  'transport_records.pod_status': values(['not_required','Não obrigatório'],['pending','Pendente'],['received','Recebido'],['validated','Validado'],['rejected','Rejeitado'],['expired','Vencido']),
  'finance_records.billing_status': values(['pending','Pendente'],['blocked','Bloqueado'],['released','Liberado'],['billed','Faturado'],['canceled','Cancelado']),
  'finance_records.payment_status': values(['pending','Pendente'],['scheduled','Agendado'],['paid','Pago'],['overdue','Vencido'],['canceled','Cancelado']),
  'finance_records.billing_block_status': values(['none','Sem bloqueio'],['blocked','Bloqueado'],['released','Liberado']),
  'finance_records.financial_approval_status': values(['pending','Pendente'],['approved','Aprovado'],['rejected','Rejeitado']),
  'occurrences.current_priority': values(['low','Baixa'],['normal','Normal'],['high','Alta'],['urgent','Urgente']),
  'occurrences.priority': values(['low','Baixa'],['normal','Normal'],['high','Alta'],['urgent','Urgente']),
  'occurrences.source_channel': values(['manual','Manual'],['public_chat','Chat público'],['inbox','Inbox'],['whatsapp','WhatsApp'],['api','API'],['import','Importação']),
};

@Injectable()
export class CanonicalValueDomainsService {
  constructor(private readonly db: SupabaseService) {}

  getCanonicalAllowedValues(entityKey: string, fieldKey: string) {
    return DOMAINS[`${entityKey}.${fieldKey}`] ?? [];
  }

  async ensureAllowedValues(tenantId: string, contractId: string, contractFieldId: string, entityKey: string, fieldKey: string) {
    const domain = this.getCanonicalAllowedValues(entityKey, fieldKey);
    if (!domain.length) return [];
    const existing = await this.db.select<Array<{ value: string }>>('data_contract_allowed_values', `select=value&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&data_contract_field_id=eq.${contractFieldId}`);
    const known = new Set(existing.map(({ value }) => value));
    const missing = domain.filter(({ value }) => !known.has(value));
    if (missing.length) await this.db.insert('data_contract_allowed_values', missing.map((item) => ({ tenant_id: tenantId, data_contract_id: contractId, data_contract_field_id: contractFieldId, ...item, is_active: true })));
    return domain;
  }
}
