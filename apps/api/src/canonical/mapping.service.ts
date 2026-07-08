import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RbacService } from '../rbac/rbac.service';
import { SupabaseService } from '../supabase/supabase.service';

const entityFields = 'id,tenant_id,module_key,entity_key,name,description,status,is_system,sort_order,created_at,updated_at';
const canonicalFieldFields = 'id,tenant_id,canonical_entity_id,field_key,name,description,data_type,is_required,is_system,sort_order,created_at,updated_at';
const mappingFields = 'id,tenant_id,data_contract_id,data_contract_field_id,canonical_entity_id,canonical_field_id,mapping_type,status,notes,created_at,updated_at,data_contract_field:data_contract_fields!field_mappings_contract_field_tenant_fk(id,field_key,source_field_name,data_type),canonical_field:canonical_fields!field_mappings_canonical_field_tenant_fk(id,field_key,name,data_type)';
const transformationRuleFields = 'id,tenant_id,field_mapping_id,rule_type,rule_config,sort_order,is_active,created_at,updated_at';
const validationRuleFields = 'id,tenant_id,canonical_entity_id,canonical_field_id,rule_type,rule_config,severity,is_active,message,created_at,updated_at,canonical_field:canonical_fields!validation_rules_field_tenant_fk(id,field_key,name,data_type)';

@Injectable()
export class MappingService {
  constructor(private readonly supabase: SupabaseService, private readonly rbac: RbacService) {}
  listEntities(tenantId: string) { return this.supabase.select('canonical_entities', `select=${entityFields}&tenant_id=eq.${tenantId}&order=sort_order.asc`); }
  async getEntity(tenantId: string, entityId: string) { return this.one('canonical_entities', `select=${entityFields}&tenant_id=eq.${tenantId}&id=eq.${entityId}&limit=1`, 'Canonical entity not found.'); }
  createEntity(tenantId: string, userId: string, body: Record<string, unknown>) { const p = this.pick(body, ['module_key','entity_key','name','description','status','is_system','sort_order']); if (!p.module_key || !p.entity_key || !p.name) throw new BadRequestException('module_key, entity_key and name are required.'); return this.supabase.insert('canonical_entities', { ...p, tenant_id: tenantId, created_by: userId, updated_by: userId }); }
  updateEntity(tenantId: string, entityId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('canonical_entities', `tenant_id=eq.${tenantId}&id=eq.${entityId}`, { ...this.pick(body, ['module_key','entity_key','name','description','status','is_system','sort_order']), updated_by: userId }); }
  async listFields(tenantId: string, entityId: string) { await this.ensure('canonical_entities', tenantId, entityId, 'Canonical entity not found.'); return this.supabase.select('canonical_fields', `select=${canonicalFieldFields}&tenant_id=eq.${tenantId}&canonical_entity_id=eq.${entityId}&order=sort_order.asc`); }
  async createField(tenantId: string, entityId: string, userId: string, body: Record<string, unknown>) { await this.ensure('canonical_entities', tenantId, entityId, 'Canonical entity not found.'); const p = this.pick(body, ['field_key','name','description','data_type','is_required','is_system','sort_order']); if (!p.field_key || !p.name || !p.data_type) throw new BadRequestException('field_key, name and data_type are required.'); return this.supabase.insert('canonical_fields', { ...p, tenant_id: tenantId, canonical_entity_id: entityId, created_by: userId, updated_by: userId }); }
  updateField(tenantId: string, fieldId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('canonical_fields', `tenant_id=eq.${tenantId}&id=eq.${fieldId}`, { ...this.pick(body, ['field_key','name','description','data_type','is_required','is_system','sort_order']), updated_by: userId }); }
  listMappings(tenantId: string, contractId: string) { return this.supabase.select('field_mappings', `select=${mappingFields}&tenant_id=eq.${tenantId}&data_contract_id=eq.${contractId}&order=created_at.asc`); }
  async createMapping(tenantId: string, contractId: string, userId: string, body: Record<string, unknown>) { const p = this.pick(body, ['data_contract_field_id','canonical_entity_id','canonical_field_id','mapping_type','status','notes']); if (!p.data_contract_field_id || !p.canonical_entity_id || !p.canonical_field_id) throw new BadRequestException('data_contract_field_id, canonical_entity_id and canonical_field_id are required.'); await Promise.all([this.ensure('data_contracts', tenantId, contractId, 'Data contract not found.'), this.ensureChild('data_contract_fields', tenantId, String(p.data_contract_field_id), 'data_contract_id', contractId, 'Data contract field not found for this contract.'), this.ensure('canonical_entities', tenantId, String(p.canonical_entity_id), 'Canonical entity not found.'), this.ensureChild('canonical_fields', tenantId, String(p.canonical_field_id), 'canonical_entity_id', String(p.canonical_entity_id), 'Canonical field not found for this entity.')]); return this.supabase.insert('field_mappings', { ...p, status: p.status ?? 'active', tenant_id: tenantId, data_contract_id: contractId, created_by: userId, updated_by: userId }); }
  updateMapping(tenantId: string, mappingId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('field_mappings', `tenant_id=eq.${tenantId}&id=eq.${mappingId}`, { ...this.pick(body, ['data_contract_field_id','canonical_entity_id','canonical_field_id','mapping_type','status','notes']), updated_by: userId }); }
  async listTransformationRules(tenantId: string, mappingId: string) { await this.ensure('field_mappings', tenantId, mappingId, 'Field mapping not found.'); return this.supabase.select('transformation_rules', `select=${transformationRuleFields}&tenant_id=eq.${tenantId}&field_mapping_id=eq.${mappingId}&order=sort_order.asc`); }
  async createTransformationRule(tenantId: string, mappingId: string, userId: string, body: Record<string, unknown>) { await this.ensure('field_mappings', tenantId, mappingId, 'Field mapping not found.'); const p = this.pick(body, ['rule_type','rule_config','sort_order','is_active']); if (!p.rule_type) throw new BadRequestException('rule_type is required.'); return this.supabase.insert('transformation_rules', { ...p, tenant_id: tenantId, field_mapping_id: mappingId, created_by: userId, updated_by: userId }); }
  updateTransformationRule(tenantId: string, ruleId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('transformation_rules', `tenant_id=eq.${tenantId}&id=eq.${ruleId}`, { ...this.pick(body, ['rule_type','rule_config','sort_order','is_active']), updated_by: userId }); }
  async listValidationRules(tenantId: string, entityId: string) { await this.ensure('canonical_entities', tenantId, entityId, 'Canonical entity not found.'); return this.supabase.select('validation_rules', `select=${validationRuleFields}&tenant_id=eq.${tenantId}&canonical_entity_id=eq.${entityId}&order=created_at.asc`); }
  async createValidationRule(tenantId: string, entityId: string, userId: string, body: Record<string, unknown>) { await this.ensure('canonical_entities', tenantId, entityId, 'Canonical entity not found.'); const p = this.pick(body, ['canonical_field_id','rule_type','rule_config','severity','is_active','message']); if (!p.rule_type) throw new BadRequestException('rule_type is required.'); if (p.canonical_field_id) await this.ensure('canonical_fields', tenantId, String(p.canonical_field_id), 'Canonical field not found.'); return this.supabase.insert('validation_rules', { ...p, tenant_id: tenantId, canonical_entity_id: entityId, created_by: userId, updated_by: userId }); }
  updateValidationRule(tenantId: string, ruleId: string, userId: string, body: Record<string, unknown>) { return this.supabase.update('validation_rules', `tenant_id=eq.${tenantId}&id=eq.${ruleId}`, { ...this.pick(body, ['canonical_field_id','rule_type','rule_config','severity','is_active','message']), updated_by: userId }); }
  async listNativeSchema(tenantId: string, userId: string, moduleKey?: string) {
    await this.rbac.ensureTenantMembership(userId, tenantId);
    const allowedModules = await this.listEnabledModuleKeys(tenantId);
    const nativeEntityKeys = ['operation_records','transport_records','attendance_records','finance_records','warehouse_records','team_records'];
    const entities = await this.supabase.select<Array<Record<string, unknown>>>('canonical_entities', `select=${entityFields}&tenant_id=eq.${tenantId}&entity_key=in.(${nativeEntityKeys.join(',')})&status=eq.active&order=sort_order.asc`);
    const filteredEntities = entities.filter((entity) => {
      const currentModuleKey = String(entity.module_key);
      if (currentModuleKey !== 'core' && !allowedModules.includes(currentModuleKey)) return false;
      return !moduleKey || currentModuleKey === 'core' || currentModuleKey === moduleKey;
    });
    const entityIds = filteredEntities.map((entity) => String(entity.id));
    const fields = entityIds.length ? await this.supabase.select<Array<Record<string, unknown>>>('canonical_fields', `select=${canonicalFieldFields}&tenant_id=eq.${tenantId}&canonical_entity_id=in.(${entityIds.join(',')})&order=sort_order.asc`) : [];
    return filteredEntities.map((entity) => ({ ...entity, fields: fields.filter((field) => field.canonical_entity_id === entity.id) }));
  }
  private async listEnabledModuleKeys(tenantId: string) {
    const subscriptions = await this.supabase.select<Array<{ plan_id: string }>>('subscriptions', `select=plan_id&tenant_id=eq.${tenantId}&status=eq.active&limit=1`);
    const planId = subscriptions[0]?.plan_id;
    if (!planId) return ['core'];
    const rows = await this.supabase.select<Array<{ module: { key: string } }>>('plan_modules', `select=module:modules!inner(key)&plan_id=eq.${planId}&is_included=eq.true`);
    return rows.map((row) => row.module.key);
  }
  private async ensure(table: string, tenantId: string, id: string, message: string) { const rows = await this.supabase.select<unknown[]>(table, `select=id&tenant_id=eq.${tenantId}&id=eq.${id}&limit=1`); if (!rows.length) throw new NotFoundException(message); }
  private async ensureChild(table: string, tenantId: string, id: string, parentColumn: string, parentId: string, message: string) { const rows = await this.supabase.select<unknown[]>(table, `select=id&tenant_id=eq.${tenantId}&id=eq.${id}&${parentColumn}=eq.${parentId}&limit=1`); if (!rows.length) throw new NotFoundException(message); }
  private async one(table: string, query: string, message: string) { const rows = await this.supabase.select<unknown[]>(table, query); if (!rows.length) throw new NotFoundException(message); return rows[0]; }
  private pick(body: Record<string, unknown>, keys: string[]) { return Object.fromEntries(keys.filter((key) => body[key] !== undefined).map((key) => [key, body[key]])); }
}
