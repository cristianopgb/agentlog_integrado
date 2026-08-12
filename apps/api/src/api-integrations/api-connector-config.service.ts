import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { SupabaseService } from '../supabase/supabase.service';
import { ApiConfig } from './api-connector.types';

@Injectable()
export class ApiConnectorConfigService {
  constructor(private readonly db: SupabaseService) {}
  async get(tenantId: string, sourceId: string, includeSecret = false) {
    await this.ensureApiSource(tenantId, sourceId);
    const rows = await this.db.select<ApiConfig[]>('data_source_api_configs', `select=*&tenant_id=eq.${tenantId}&data_source_id=eq.${sourceId}&limit=1`);
    if (!rows[0]) return null;
    const { credentials_encrypted, ...safe } = rows[0];
    return includeSecret ? rows[0] : { ...safe, credentials_configured: Boolean(credentials_encrypted) };
  }
  async save(tenantId: string, sourceId: string, body: Record<string, unknown>) {
    await this.ensureApiSource(tenantId, sourceId);
    const baseUrl = String(body.base_url ?? ''); const endpoint = String(body.endpoint_path ?? '');
    await this.assertSafeUrl(baseUrl, endpoint);
    const authType = String(body.auth_type ?? 'none');
    if (!['none','bearer_token','api_key_header','basic'].includes(authType)) throw new BadRequestException('Tipo de autenticação inválido.');
    if (authType === 'api_key_header' && !body.auth_header_name) throw new BadRequestException('Nome do header é obrigatório.');
    const frequency = body.sync_frequency_minutes == null ? null : Number(body.sync_frequency_minutes);
    if (frequency !== null && ![15,60,1440].includes(frequency)) throw new BadRequestException('Periodicidade inválida.');
    const pageSize = Math.min(500, Math.max(1, Number(body.page_size ?? 100)));
    const current = await this.get(tenantId, sourceId, true) as ApiConfig | null;
    if (authType !== 'none' && !(typeof body.secret === 'string' && body.secret) && !current?.credentials_encrypted) throw new BadRequestException('O segredo é obrigatório para a autenticação selecionada.');
    const secret = typeof body.secret === 'string' && body.secret ? this.encrypt(body.secret) : current?.credentials_encrypted ?? null;
    const auto = Boolean(body.auto_sync_enabled);
    const payload = { tenant_id: tenantId, data_source_id: sourceId, base_url: baseUrl.replace(/\/$/, ''), endpoint_path: endpoint,
      method: 'GET', auth_type: authType, auth_header_name: body.auth_header_name || null, credentials_encrypted: secret,
      response_root_path: body.response_root_path || null, external_id_field: body.external_id_field || null,
      updated_at_field: body.updated_at_field || null, updated_since_param: body.updated_since_param || null,
      page_param: body.page_param || null, page_size_param: body.page_size_param || null, page_size: pageSize,
      auto_sync_enabled: auto, sync_frequency_minutes: auto ? frequency : null,
      next_sync_at: auto && frequency ? (current?.next_sync_at ?? new Date().toISOString()) : null };
    await this.db.upsert('data_source_api_configs', payload, 'tenant_id,data_source_id');
    const published = await this.db.select<unknown[]>('operation_records', `select=id&tenant_id=eq.${tenantId}&source_data_source_id=eq.${sourceId}&deleted_at=is.null&is_current=eq.true&canonical_validity_status=eq.valid&limit=1`);
    if (published.length)
      await this.db.update('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}&status=eq.configuring`, { status: 'active' });
    else
      await this.db.update('data_sources', `tenant_id=eq.${tenantId}&id=eq.${sourceId}&status=neq.active`, { status: 'configuring' });
    return this.get(tenantId, sourceId);
  }
  decrypt(value: string | null) {
    if (!value) return '';
    const key = this.key(); const [ivText, tagText, data] = value.split('.');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
  async assertSafeUrl(base: string, endpoint: string) {
    let url: URL; try { url = new URL(endpoint, `${base.replace(/\/$/, '')}/`); } catch { throw new BadRequestException('URL inválida.'); }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new BadRequestException('Apenas URLs HTTP/HTTPS sem credenciais são aceitas.');
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new BadRequestException('HTTPS é obrigatório em produção.');
    const addresses = await lookup(url.hostname, { all: true }).catch(() => { throw new BadRequestException('Host não pôde ser resolvido.'); });
    if (!addresses.length || addresses.some(({ address }) => this.privateIp(address))) throw new BadRequestException('Host local ou privado não é permitido.');
    return url;
  }
  private encrypt(secret: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key(), iv); const data = Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`; }
  private key() { const raw = process.env.INTEGRATION_SECRET_KEY; if (!raw) throw new Error('INTEGRATION_SECRET_KEY is required.'); return createHash('sha256').update(raw).digest(); }
  private privateIp(ip: string): boolean {
    const value = ip.toLowerCase();
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return this.privateIp(mapped);
    if (!isIP(value)) return true;
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb') || value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(value) || value.startsWith('169.254.') || value === '0.0.0.0';
  }
  private async ensureApiSource(tenantId: string, sourceId: string) { const rows = await this.db.select<Array<{source_type:string}>>('data_sources', `select=source_type&tenant_id=eq.${tenantId}&id=eq.${sourceId}&limit=1`); if (!rows[0]) throw new NotFoundException('Integração não encontrada.'); if (rows[0].source_type !== 'api') throw new BadRequestException('A fonte não é do tipo API.'); }
}
