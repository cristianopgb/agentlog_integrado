import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown> & { id: string; tenant_id?: string };
const channels = new Set([
  'manual',
  'api',
  'whatsapp',
  'email',
  'system',
  'public_chat',
]);
const externalChannels = new Set([
  'manual',
  'api',
  'whatsapp',
  'email',
  'public_chat',
]);
const statuses = new Set([
  'open',
  'waiting_contact',
  'waiting_internal',
  'assigned',
  'closed',
  'archived',
]);
const contactTypes = new Set([
  'driver',
  'customer',
  'recipient',
  'shipper',
  'employee',
  'third_party',
  'unknown',
]);
const openStatuses = [
  'open',
  'waiting_contact',
  'waiting_internal',
  'assigned',
];

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);
  constructor(private readonly db: SupabaseService) {}
  private text(value: unknown, name: string, required = false, max = 4000) {
    if (value == null && !required) return undefined;
    if (
      typeof value !== 'string' ||
      (required && !value.trim()) ||
      value.length > max
    )
      throw new BadRequestException(`${name} inválido.`);
    return value.trim();
  }
  private async conversation(tenant: string, id: string) {
    const rows = await this.db.select<Row[]>(
      'inbox_conversations',
      `select=id,tenant_id,contact_id,channel,status,assigned_user_id,title,last_message_at,summary,source_reference,created_at,closed_at&tenant_id=eq.${tenant}&id=eq.${id}&deleted_at=is.null&limit=1`,
    );
    if (!rows[0]) throw new NotFoundException('Conversa não encontrada.');
    return rows[0];
  }
  async refreshSummary(tenant: string, id: string) {
    try {
      const [messages, links] = await Promise.all([
        this.db.select<Row[]>(
          'inbox_messages',
          `select=sender_type,body&tenant_id=eq.${tenant}&conversation_id=eq.${id}&deleted_at=is.null&order=created_at.desc&limit=6`,
        ),
        this.db.select<Row[]>(
          'conversation_occurrence_links',
          `select=occurrence_id&tenant_id=eq.${tenant}&conversation_id=eq.${id}&deleted_at=is.null&limit=1`,
        ),
      ]);
      let occurrence = '';
      if (links[0])
        occurrence = String(
          (
            await this.db.select<Row[]>(
              'occurrences',
              `select=occurrence_number,current_status&tenant_id=eq.${tenant}&id=eq.${links[0].occurrence_id}&deleted_at=is.null&limit=1`,
            )
          )[0]?.occurrence_number ?? '',
        );
      const excerpt = messages
        .reverse()
        .map(
          (m) =>
            `${m.sender_type === 'contact' ? 'Motorista' : 'Operador/AgentLog'}: ${String(m.body ?? '').slice(0, 180)}`,
        )
        .filter(Boolean)
        .join(' · ')
        .slice(0, 900);
      await this.db.update(
        'inbox_conversations',
        `tenant_id=eq.${tenant}&id=eq.${id}`,
        {
          summary: `${excerpt}${occurrence ? ` · Ocorrência ${occurrence} vinculada.` : ' · Atendimento em andamento.'}`,
          summary_updated_at: new Date().toISOString(),
        },
      );
    } catch {
      /* Resumo é auxiliar e nunca bloqueia o atendimento. */
    }
  }
  private async attachments(tenant: string, conversation: string) {
    const rows = await this.db.select<Row[]>(
      'inbox_message_attachments',
      `select=id,message_id,occurrence_id,original_filename,mime_type,size_bytes,storage_bucket,storage_path,created_at&tenant_id=eq.${tenant}&conversation_id=eq.${conversation}&deleted_at=is.null&order=created_at.asc`,
    );
    const signed = await Promise.allSettled(
      rows.map(async ({ storage_bucket, storage_path, ...row }) => ({
        ...row,
        download_url: await this.db.signedObjectUrl(
          String(storage_bucket),
          String(storage_path),
        ),
      })),
    );
    return signed.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
  }
  async uploadAttachment(
    tenant: string,
    id: string,
    uploader: 'public_user' | 'internal_user',
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    messageId?: string,
    createdBy?: string,
  ) {
    await this.conversation(tenant, id);
    const max =
      Math.max(1, Number(process.env.INBOX_ATTACHMENT_MAX_MB) || 10) *
      1024 *
      1024;
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    if (!file?.buffer || !allowed.has(file.mimetype))
      throw new BadRequestException(
        'Tipo de arquivo não permitido. Envie imagem, PDF ou documento compatível.',
      );
    if (file.size > max)
      throw new BadRequestException(
        `Arquivo excede o limite de ${Math.round(max / 1024 / 1024)} MB.`,
      );
    const link = (
      await this.db.select<Row[]>(
        'conversation_occurrence_links',
        `select=occurrence_id&tenant_id=eq.${tenant}&conversation_id=eq.${id}&deleted_at=is.null&limit=1`,
      )
    )[0];
    const safeName = file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-180),
      bucket = process.env.INBOX_ATTACHMENT_BUCKET || 'inbox-attachments';
    const path = `${tenant}/${id}/${randomUUID()}-${safeName}`;
    try {
      await this.db.uploadObject(bucket, path, file.buffer, file.mimetype);
    } catch {
      throw new BadRequestException(
        'Não foi possível enviar o arquivo agora. Tente novamente.',
      );
    }
    const [row] = await this.db.insert<Row[]>('inbox_message_attachments', {
      tenant_id: tenant,
      conversation_id: id,
      message_id: messageId ?? null,
      occurrence_id: link?.occurrence_id ?? null,
      storage_bucket: bucket,
      storage_path: path,
      original_filename: file.originalname.slice(0, 255),
      mime_type: file.mimetype,
      size_bytes: file.size,
      uploaded_by_type: uploader,
      created_by: createdBy ?? null,
    });
    return {
      id: row.id,
      message_id: row.message_id,
      occurrence_id: row.occurrence_id,
      original_filename: row.original_filename,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      download_url: await this.db.signedObjectUrl(bucket, path),
    };
  }
  private event(
    tenant: string,
    conversation: string,
    type: string,
    title: string,
    user?: string,
    description?: string,
  ) {
    return this.db.insert<Row[]>('inbox_events', {
      tenant_id: tenant,
      conversation_id: conversation,
      event_type: type,
      event_title: title,
      event_description: description,
      created_by: user ?? null,
    });
  }
  async list(tenant: string, q: Record<string, string> = {}) {
    const filters = [
      'select=id,contact_id,channel,status,assigned_user_id,title,summary,last_message_at,created_at',
      `tenant_id=eq.${tenant}`,
      'deleted_at=is.null',
    ];
    if (q.status) {
      if (!statuses.has(q.status))
        throw new BadRequestException('Status inválido.');
      filters.push(`status=eq.${q.status}`);
    }
    if (q.channel) {
      if (!channels.has(q.channel))
        throw new BadRequestException('Canal inválido.');
      filters.push(`channel=eq.${q.channel}`);
    }
    if (q.assigned_user_id)
      filters.push(`assigned_user_id=eq.${q.assigned_user_id}`);
    const rows = await this.db.select<Row[]>(
      'inbox_conversations',
      `${filters.join('&')}&order=last_message_at.desc.nullslast&limit=${Math.min(Math.max(Number(q.limit) || 50, 1), 100)}`,
    );
    const compact = await Promise.all(
      rows.map(async (row) => {
        const [contact, messages, links] = await Promise.all([
          row.contact_id
            ? this.db.select<Row[]>(
                'contacts',
                `select=id,name,phone,email,contact_type&tenant_id=eq.${tenant}&id=eq.${row.contact_id}&deleted_at=is.null&limit=1`,
              )
            : Promise.resolve([]),
          this.db.select<Row[]>(
            'inbox_messages',
            `select=body&tenant_id=eq.${tenant}&conversation_id=eq.${row.id}&deleted_at=is.null&order=created_at.desc&limit=1`,
          ),
          this.db.select<Row[]>(
            'conversation_occurrence_links',
            `select=id&tenant_id=eq.${tenant}&conversation_id=eq.${row.id}&deleted_at=is.null`,
          ),
        ]);
        return {
          ...row,
          contact: contact[0] ?? null,
          last_message_preview:
            typeof messages[0]?.body === 'string'
              ? messages[0].body.slice(0, 120)
              : null,
          occurrence_links_count: links.length,
        };
      }),
    );
    const search = q.search?.trim().toLocaleLowerCase('pt-BR');
    if (!search) return compact;
    return compact.filter((row) => {
      const conversation = row as Row;
      const contact = row.contact as Row | null;
      return [
        conversation.title,
        conversation.summary,
        contact?.name,
        contact?.phone,
      ]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLocaleLowerCase('pt-BR').includes(search));
    });
  }
  async detail(tenant: string, id: string) {
    const conversation = await this.conversation(tenant, id);
    const optional = async <T>(
      label: string,
      fallback: T,
      query: Promise<T>,
    ) => {
      try {
        return await query;
      } catch (error) {
        this.logger.error(
          `inbox_detail_optional_failed tenant=${tenant} conversation=${id} part=${label}`,
          error instanceof Error ? error.stack : String(error),
        );
        return fallback;
      }
    };
    const [contact, messages, links, events, attachments] = await Promise.all([
      conversation.contact_id
        ? optional(
            'contact',
            [],
            this.db.select<Row[]>(
              'contacts',
              `select=id,name,phone,email,contact_type,external_ref,is_active,created_at&tenant_id=eq.${tenant}&id=eq.${conversation.contact_id}&deleted_at=is.null&limit=1`,
            ),
          )
        : Promise.resolve([]),
      optional(
        'messages',
        [],
        this.db.select<Row[]>(
          'inbox_messages',
          `select=id,direction,sender_type,body,media_url,media_type,status,created_at&tenant_id=eq.${tenant}&conversation_id=eq.${id}&deleted_at=is.null&order=created_at.asc`,
        ),
      ),
      optional(
        'occurrence_links',
        [],
        this.db.select<Row[]>(
          'conversation_occurrence_links',
          `select=id,occurrence_id,relationship_type,created_at&tenant_id=eq.${tenant}&conversation_id=eq.${id}&deleted_at=is.null&order=created_at.asc`,
        ),
      ),
      optional(
        'events',
        [],
        this.db.select<Row[]>(
          'inbox_events',
          `select=id,event_type,event_title,event_description,created_by,created_at&tenant_id=eq.${tenant}&conversation_id=eq.${id}&order=created_at.asc`,
        ),
      ),
      optional('attachments', [], this.attachments(tenant, id)),
    ]);
    const occurrenceLinks = await Promise.all(
      links.map(async (link) => {
        const occurrence =
          (
            await optional(
              'occurrence',
              [],
              this.db.select<Row[]>(
                'occurrences',
                `select=occurrence_number,current_status,current_priority,reason_id,updated_at&tenant_id=eq.${tenant}&id=eq.${link.occurrence_id}&deleted_at=is.null&limit=1`,
              ),
            )
          )[0] ?? null;
        const treatment =
          (
            await optional(
              'treatments',
              [],
              this.db.select<Row[]>(
                'occurrence_treatments',
                `select=description,created_at&tenant_id=eq.${tenant}&occurrence_id=eq.${link.occurrence_id}&deleted_at=is.null&order=created_at.desc&limit=1`,
              ),
            )
          )[0] ?? null;
        return {
          ...link,
          occurrence: occurrence
            ? { ...occurrence, latest_treatment: treatment }
            : null,
        };
      }),
    );
    return {
      conversation,
      contact: contact[0] ?? null,
      messages,
      occurrence_links: occurrenceLinks,
      events,
      attachments,
    };
  }
  async createMessage(
    tenant: string,
    id: string,
    user: string,
    body: Record<string, unknown>,
  ) {
    await this.conversation(tenant, id);
    const direction = this.text(body.direction, 'direction', true, 20),
      sender = this.text(body.sender_type, 'sender_type', true, 20);
    if (!['outbound', 'internal'].includes(direction!) || sender !== 'user')
      throw new BadRequestException('Mensagem manual inválida.');
    const text = this.text(body.body, 'body', false, 10000),
      mediaUrl = this.text(body.media_url, 'media_url', false, 2000);
    if (!text && !mediaUrl)
      throw new BadRequestException('Informe texto ou mídia.');
    const now = new Date().toISOString();
    const rows = await this.db.insert<Row[]>('inbox_messages', {
      tenant_id: tenant,
      conversation_id: id,
      direction,
      sender_type: 'user',
      body: text ?? null,
      media_url: mediaUrl ?? null,
      media_type: this.text(body.media_type, 'media_type', false, 100) ?? null,
      status: 'recorded',
    });
    await this.db.update<Row[]>(
      'inbox_conversations',
      `tenant_id=eq.${tenant}&id=eq.${id}`,
      { last_message_at: now, updated_at: now },
    );
    await this.event(
      tenant,
      id,
      'message_created',
      'Mensagem registrada',
      user,
    );
    await this.refreshSummary(tenant, id);
    return rows[0];
  }
  async assign(
    tenant: string,
    id: string,
    user: string,
    body: Record<string, unknown>,
  ) {
    await this.conversation(tenant, id);
    const assigned =
      this.text(body.assigned_user_id, 'assigned_user_id', false, 100) ?? user;
    const rows = await this.db.update<Row[]>(
      'inbox_conversations',
      `tenant_id=eq.${tenant}&id=eq.${id}&deleted_at=is.null`,
      {
        assigned_user_id: assigned,
        status: 'assigned',
        updated_at: new Date().toISOString(),
      },
    );
    await this.event(tenant, id, 'assigned', 'Conversa atribuída', user);
    return rows[0];
  }
  async changeStatus(
    tenant: string,
    id: string,
    user: string,
    body: Record<string, unknown>,
  ) {
    await this.conversation(tenant, id);
    const status = this.text(body.status, 'status', true, 30)!;
    if (!statuses.has(status))
      throw new BadRequestException('Status inválido.');
    const now = new Date().toISOString();
    const rows = await this.db.update<Row[]>(
      'inbox_conversations',
      `tenant_id=eq.${tenant}&id=eq.${id}&deleted_at=is.null`,
      { status, closed_at: status === 'closed' ? now : null, updated_at: now },
    );
    await this.event(
      tenant,
      id,
      'status_changed',
      'Status da conversa alterado',
      user,
      status,
    );
    await this.refreshSummary(tenant, id);
    return rows[0];
  }
  async linkOccurrence(
    tenant: string,
    id: string,
    user: string,
    body: Record<string, unknown>,
  ) {
    await this.conversation(tenant, id);
    const occurrence = this.text(
      body.occurrence_id,
      'occurrence_id',
      true,
      100,
    )!;
    const found = await this.db.select<Row[]>(
      'occurrences',
      `select=id&tenant_id=eq.${tenant}&id=eq.${occurrence}&deleted_at=is.null&limit=1`,
    );
    if (!found[0])
      throw new BadRequestException('Ocorrência não pertence ao tenant.');
    const rows = await this.db.insert<Row[]>('conversation_occurrence_links', {
      tenant_id: tenant,
      conversation_id: id,
      occurrence_id: occurrence,
      relationship_type:
        this.text(body.relationship_type, 'relationship_type', false, 100) ??
        'related',
      created_by: user,
    });
    await this.event(
      tenant,
      id,
      'occurrence_linked',
      'Ocorrência vinculada',
      user,
      occurrence,
    );
    await this.db.update(
      'inbox_message_attachments',
      `tenant_id=eq.${tenant}&conversation_id=eq.${id}&occurrence_id=is.null&deleted_at=is.null`,
      { occurrence_id: occurrence },
    );
    await this.refreshSummary(tenant, id);
    return rows[0];
  }
  async unlinkOccurrence(
    tenant: string,
    id: string,
    linkId: string,
    user: string,
  ) {
    await this.conversation(tenant, id);
    const now = new Date().toISOString();
    const rows = await this.db.update<Row[]>(
      'conversation_occurrence_links',
      `tenant_id=eq.${tenant}&conversation_id=eq.${id}&id=eq.${linkId}&deleted_at=is.null`,
      { deleted_at: now },
    );
    if (!rows[0]) throw new NotFoundException('Vínculo não encontrado.');
    await this.event(
      tenant,
      id,
      'occurrence_unlinked',
      'Ocorrência desvinculada',
      user,
    );
    return { deleted: true };
  }
  async externalMessage(
    authorization: string | undefined,
    body: Record<string, unknown>,
  ) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (!token) throw new UnauthorizedException('Token externo obrigatório.');
    const digest = createHash('sha256').update(token).digest('hex');
    const clients = await this.db.select<Row[]>(
      'external_api_clients',
      `select=id,tenant_id,token_hash,is_active,allowed_scope&token_hash=eq.${digest}&deleted_at=is.null&limit=1`,
    );
    const client = clients[0];
    const stored =
      typeof client?.token_hash === 'string' ? client.token_hash : '';
    if (
      !client ||
      stored.length !== digest.length ||
      !timingSafeEqual(Buffer.from(stored), Buffer.from(digest))
    )
      throw new UnauthorizedException('Token externo inválido.');
    if (client.is_active !== true)
      throw new UnauthorizedException('Cliente de API inativo.');
    if (
      !String(client.allowed_scope)
        .split(/[ ,]+/)
        .includes('inbox.messages.create')
    )
      throw new ForbiddenException('Escopo não autorizado.');
    const tenant = String(client.tenant_id),
      phone = this.text(body.contact_phone, 'contact_phone', true, 40)!,
      name = this.text(body.contact_name, 'contact_name', false, 200),
      type =
        this.text(body.contact_type, 'contact_type', false, 30) ?? 'unknown',
      channel = this.text(body.channel, 'channel', true, 20)!,
      message = this.text(body.body, 'body', true, 10000)!;
    if (!contactTypes.has(type) || !externalChannels.has(channel))
      throw new BadRequestException('Tipo de contato ou canal inválido.');
    if (
      body.metadata !== undefined &&
      (typeof body.metadata !== 'object' ||
        body.metadata === null ||
        Array.isArray(body.metadata))
    )
      throw new BadRequestException('metadata deve ser objeto simples.');
    let contact = (
      await this.db.select<Row[]>(
        'contacts',
        `select=id,name,phone&tenant_id=eq.${tenant}&phone=eq.${encodeURIComponent(phone)}&deleted_at=is.null&limit=1`,
      )
    )[0];
    if (!contact)
      contact = (
        await this.db.insert<Row[]>('contacts', {
          tenant_id: tenant,
          phone,
          name: name ?? null,
          contact_type: type,
        })
      )[0];
    const existing = await this.db.select<Row[]>(
      'inbox_conversations',
      `select=id&tenant_id=eq.${tenant}&contact_id=eq.${contact.id}&channel=eq.${channel}&status=in.(${openStatuses.join(',')})&deleted_at=is.null&order=last_message_at.desc.nullslast&limit=1`,
    );
    let conversation = existing[0];
    if (!conversation)
      conversation = (
        await this.db.insert<Row[]>('inbox_conversations', {
          tenant_id: tenant,
          contact_id: contact.id,
          channel,
          status: 'open',
          source_reference:
            this.text(body.source_reference, 'source_reference', false, 500) ??
            null,
        })
      )[0];
    const now = new Date().toISOString();
    const inserted = await this.db.insert<Row[]>('inbox_messages', {
      tenant_id: tenant,
      conversation_id: conversation.id,
      direction: 'inbound',
      sender_type: 'contact',
      body: message,
      provider_message_id:
        this.text(
          body.provider_message_id,
          'provider_message_id',
          false,
          500,
        ) ?? null,
      metadata: body.metadata ?? {},
      status: 'received',
    });
    await this.db.update<Row[]>(
      'inbox_conversations',
      `tenant_id=eq.${tenant}&id=eq.${conversation.id}`,
      { last_message_at: now, updated_at: now },
    );
    await this.event(
      tenant,
      conversation.id,
      'message_received',
      'Mensagem externa recebida',
    );
    return {
      conversation_id: conversation.id,
      message_id: inserted[0].id,
      contact_id: contact.id,
    };
  }
}
