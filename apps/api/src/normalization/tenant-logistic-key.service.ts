import { BadRequestException, Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const PRIMARY_LOGISTIC_KEYS = ['delivery_number','document_number','invoice_number','cte_number','manifest_number','order_number'] as const;
export type PrimaryLogisticKey = typeof PRIMARY_LOGISTIC_KEYS[number];
export type TenantLogisticKeySetting = {tenant_id:string;primary_logistic_key:PrimaryLogisticKey;established_by_data_source_id:string|null;established_at:string};

const labels: Record<PrimaryLogisticKey,string> = {
  delivery_number:'Documento da entrega', document_number:'Documento operacional',
  invoice_number:'NF', cte_number:'CT-e', manifest_number:'Manifesto / Romaneio', order_number:'Pedido',
};
const occurrenceFields: Record<PrimaryLogisticKey,string> = {
  delivery_number:'linked_delivery_number', document_number:'linked_document_number',
  invoice_number:'linked_invoice_number', cte_number:'linked_cte_number',
  manifest_number:'linked_manifest_number', order_number:'linked_order_number',
};
const occurrenceLabels: Record<PrimaryLogisticKey,string> = {
  delivery_number:'Documento da entrega vinculada', document_number:'Documento operacional vinculado',
  invoice_number:'NF vinculada', cte_number:'CT-e vinculada',
  manifest_number:'Manifesto / Romaneio vinculado', order_number:'Pedido vinculado',
};

@Injectable()
export class TenantLogisticKeyService {
  constructor(private readonly db: SupabaseService) {}

  label(key: PrimaryLogisticKey) { return labels[key]; }
  async get(tenantId:string):Promise<TenantLogisticKeySetting|null> {
    const rows=await this.db.select<TenantLogisticKeySetting[]>('tenant_integration_settings',`select=tenant_id,primary_logistic_key,established_by_data_source_id,established_at&tenant_id=eq.${tenantId}&limit=1`);
    return rows[0]??null;
  }
  async establish(tenantId:string, sourceId:string, key:string, userId:string) {
    if(!PRIMARY_LOGISTIC_KEYS.includes(key as PrimaryLogisticKey)) throw new BadRequestException('Chave logística principal inválida.');
    const current=await this.get(tenantId);
    if(current && current.primary_logistic_key!==key) throw new BadRequestException(`Esta empresa já usa ${this.label(current.primary_logistic_key)} como chave logística principal. A chave não pode ser alterada por outra integração.`);
    if(!current) await this.db.insert('tenant_integration_settings',{tenant_id:tenantId,primary_logistic_key:key,established_by_data_source_id:sourceId,updated_by:userId});
    return (await this.get(tenantId))!;
  }
  expectedCanonicalField(key:PrimaryLogisticKey, entityKey:string) {
    return entityKey==='occurrences' ? occurrenceFields[key] : key;
  }
  expectedCanonicalLabel(key:PrimaryLogisticKey, entityKey:string) {
    return entityKey==='occurrences' ? `Ocorrências / ${occurrenceLabels[key]}` : this.label(key);
  }
  async validateSourceMapping(tenantId:string, contractId:string, entityKey:string) {
    const setting=await this.get(tenantId);
    if(!setting) throw new BadRequestException('Defina a chave logística principal da empresa antes de publicar dados canônicos.');
    const expected=this.expectedCanonicalField(setting.primary_logistic_key,entityKey);
    const entities=await this.db.select<Array<{id:string}>>('canonical_entities',`select=id&tenant_id=eq.${tenantId}&entity_key=eq.${entityKey}&limit=1`);
    const fields=entities[0]?await this.db.select<Array<{id:string}>>('canonical_fields',`select=id&tenant_id=eq.${tenantId}&canonical_entity_id=eq.${entities[0].id}&field_key=eq.${expected}&is_importable=eq.true&is_analytics_only=eq.false&limit=1`):[];
    const rows=fields.length?await this.db.select<Array<{id:string}>>('field_mappings',`select=id&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&status=eq.active&canonical_field_id=in.(${fields.map(field=>field.id).join(',')})&limit=1`):[];
    if(!rows.length) throw new BadRequestException(`Esta empresa usa ${this.label(setting.primary_logistic_key)} como chave logística principal. Mapeie um campo da API para ${this.expectedCanonicalLabel(setting.primary_logistic_key,entityKey)}.`);
    return { ...setting, expected_field: expected };
  }
  async resolveOperation(tenantId:string,key:PrimaryLogisticKey,value:unknown) {
    if(value===undefined||value===null||String(value).trim()==='') return null;
    const rows=await this.db.select<Array<{id:string}>>('operation_records',`select=id&tenant_id=eq.${tenantId}&${key}=eq.${encodeURIComponent(String(value))}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&order=data_quality_status.asc,created_at.asc,id.asc&limit=2`);
    return rows[0]?.id??null;
  }
}
