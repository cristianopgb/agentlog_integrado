import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AttendanceAgentService } from '../agents/attendance-agent.service';
import { InboxService } from '../inbox/inbox.service';

@Injectable()
export class PublicChatService {
  constructor(
    private readonly db: SupabaseService,
    private readonly attendance: AttendanceAgentService,
    private readonly inbox?: InboxService,
  ) {}
  private text(v: unknown, n: string, max: number) {
    if (typeof v !== 'string' || !v.trim() || v.length > max)
      throw new BadRequestException(`${n} inválido.`);
    return v.trim();
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private equalHash(token: string, hash: string) {
    const a = Buffer.from(this.hash(token)),
      b = Buffer.from(hash);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private async tenant(slug: string) {
    if (!/^[a-z0-9-]{2,80}$/i.test(slug))
      throw new NotFoundException('Organização não encontrada.');
    const rows = await this.db.select<any[]>(
      'tenants',
      `select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    );
    if (!rows[0]) throw new NotFoundException('Organização não encontrada.');
    return rows[0];
  }
  private async visitor(t: string, token: string) {
    if (!token) throw new UnauthorizedException('Visitante inválido.');
    const rows = await this.db.select<any[]>(
      'public_chat_sessions',
      `select=id,contact_id,contact_phone,visitor_token_hash,created_at&tenant_id=eq.${t}&visitor_token_hash=eq.${this.hash(token)}&order=created_at.desc&limit=100`,
    );
    if (!rows[0] || !this.equalHash(token, rows[0].visitor_token_hash))
      throw new UnauthorizedException('Visitante inválido.');
    return rows.find((row) => row.contact_id) ?? rows[0];
  }
  private async validateSession(t: string, id: string, token: string) {
    const rows = await this.db.select<any[]>(
        'public_chat_sessions',
        `select=id,conversation_id,session_token_hash,status&tenant_id=eq.${t}&id=eq.${id}&limit=1`,
      ),
      s = rows[0];
    if (!s || !token || !this.equalHash(token, s.session_token_hash))
      throw new UnauthorizedException('Sessão inválida.');
    if (s.status !== 'open')
      throw new BadRequestException('Esta conversa foi encerrada.');
    return s;
  }
  private async messages(t: string, c: string) {
    const [messages, attachments] = await Promise.all([
      this.db.select<any[]>(
        'inbox_messages',
        `select=id,direction,sender_type,body,created_at&tenant_id=eq.${t}&conversation_id=eq.${c}&direction=in.(inbound,outbound)&deleted_at=is.null&order=created_at.asc`,
      ),
      this.db.select<any[]>(
        'inbox_message_attachments',
        `select=id,message_id,original_filename,mime_type,size_bytes,storage_bucket,storage_path,created_at&tenant_id=eq.${t}&conversation_id=eq.${c}&deleted_at=is.null&order=created_at.asc`,
      ),
    ]);
    const safe = await Promise.all(
      attachments.map(async ({ storage_bucket, storage_path, ...a }) => ({
        ...a,
        download_url: await this.db.signedObjectUrl(
          storage_bucket,
          storage_path,
        ),
      })),
    );
    return messages
      .map((m) => ({
        ...m,
        attachments: safe.filter((a) => a.message_id === m.id),
      }))
      .concat(
        safe
          .filter((a) => !a.message_id)
          .map((a) => ({
            id: `attachment-${a.id}`,
            direction: 'inbound',
            sender_type: 'contact',
            body: null,
            created_at: a.created_at,
            attachments: [a],
          })),
      );
  }
  private title(message: string) {
    const doc = message.match(/\b(?:DOC|NF|CT-?E)[-\s]?[A-Z0-9.-]+\b/i)?.[0];
    return doc
      ? `Entrega ${doc.toUpperCase()}`
      : message.trim().split(/\s+/).slice(0, 7).join(' ').slice(0, 120) ||
          'Nova conversa';
  }
  private async respond(t: string, c: string) {
    const result = await this.attendance.processPublicConversation(t, c);
    await this.db.insert('inbox_messages', {
      tenant_id: t,
      conversation_id: c,
      direction: 'outbound',
      sender_type: 'agent',
      body: result.answer,
      status: 'sent',
    });
    await this.db.update(
      'inbox_conversations',
      `tenant_id=eq.${t}&id=eq.${c}`,
      {
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    await this.inbox?.refreshSummary(t, c);
  }
  async start(slug: string, b: Record<string, unknown>) {
    const tenant = await this.tenant(slug),
      message = this.text(b.message, 'Mensagem', 10000),
      now = new Date().toISOString(),
      visitorToken =
        typeof b.visitor_token === 'string' && b.visitor_token
          ? b.visitor_token
          : randomBytes(32).toString('base64url'),
      sessionToken = randomBytes(32).toString('base64url');
    const [conversation] = await this.db.insert<any[]>('inbox_conversations', {
      tenant_id: tenant.id,
      channel: 'public_chat',
      status: 'open',
      title: this.title(message),
      last_message_at: now,
    });
    await this.db.insert('inbox_messages', {
      tenant_id: tenant.id,
      conversation_id: conversation.id,
      direction: 'inbound',
      sender_type: 'contact',
      body: message,
      status: 'received',
    });
    const [session] = await this.db.insert<any[]>('public_chat_sessions', {
      tenant_id: tenant.id,
      conversation_id: conversation.id,
      session_token_hash: this.hash(sessionToken),
      visitor_token_hash: this.hash(visitorToken),
      last_seen_at: now,
    });
    await this.db.insert('inbox_events', {
      tenant_id: tenant.id,
      conversation_id: conversation.id,
      event_type: 'public_chat_started',
      event_title: 'Chat público iniciado',
    });
    await this.respond(tenant.id, conversation.id);
    return {
      session_id: session.id,
      session_token: sessionToken,
      visitor_token: visitorToken,
      conversation_id: conversation.id,
      messages: await this.messages(tenant.id, conversation.id),
    };
  }
  async message(slug: string, b: Record<string, unknown>) {
    const tenant = await this.tenant(slug),
      session = await this.validateSession(
        tenant.id,
        this.text(b.session_id, 'session_id', 80),
        this.text(b.session_token, 'session_token', 200),
      ),
      message = this.text(b.message, 'Mensagem', 10000),
      now = new Date().toISOString();
    await this.db.insert('inbox_messages', {
      tenant_id: tenant.id,
      conversation_id: session.conversation_id,
      direction: 'inbound',
      sender_type: 'contact',
      body: message,
      status: 'received',
    });
    await this.db.update(
      'inbox_conversations',
      `tenant_id=eq.${tenant.id}&id=eq.${session.conversation_id}`,
      { last_message_at: now, updated_at: now },
    );
    await this.respond(tenant.id, session.conversation_id);
    return {
      session_id: session.id,
      conversation_id: session.conversation_id,
      messages: await this.messages(tenant.id, session.conversation_id),
    };
  }
  async session(slug: string, id: string, token: string) {
    const tenant = await this.tenant(slug),
      session = await this.validateSession(tenant.id, id, token);
    return {
      session_id: id,
      conversation_id: session.conversation_id,
      messages: await this.messages(tenant.id, session.conversation_id),
    };
  }
  async conversations(
    slug: string,
    token: string,
    search?: string,
    rawLimit?: string,
  ) {
    const tenant = await this.tenant(slug),
      identity = await this.visitor(tenant.id, token),
      limit = Math.min(Math.max(Number(rawLimit) || 30, 1), 50),
      sessions = await this.db.select<any[]>(
        'public_chat_sessions',
        `select=conversation_id&tenant_id=eq.${tenant.id}&visitor_token_hash=eq.${this.hash(token)}&limit=100`,
      );
    let ids = sessions.map((x) => x.conversation_id);
    if (identity.contact_id) {
      const own = await this.db.select<any[]>(
        'inbox_conversations',
        `select=id&tenant_id=eq.${tenant.id}&contact_id=eq.${identity.contact_id}&channel=eq.public_chat&deleted_at=is.null&limit=100`,
      );
      ids = [...new Set([...ids, ...own.map((x) => x.id)])];
    }
    if (!ids.length) return { conversations: [] };
    const q = search?.trim().slice(0, 100),
      rows = await this.db.select<any[]>(
        'inbox_conversations',
        `select=id,title,status,channel,last_message_at&tenant_id=eq.${tenant.id}&id=in.(${ids.join(',')})&deleted_at=is.null&order=last_message_at.desc&limit=${limit}`,
      ),
      result = [];
    for (const row of rows) {
      const messages = await this.db.select<any[]>(
          'inbox_messages',
          `select=body,created_at&tenant_id=eq.${tenant.id}&conversation_id=eq.${row.id}&deleted_at=is.null&order=created_at.desc&limit=20`,
        ),
        links = await this.db.select<any[]>(
          'conversation_occurrence_links',
          `select=occurrence_id&tenant_id=eq.${tenant.id}&conversation_id=eq.${row.id}&deleted_at=is.null&limit=1`,
        );
      let occurrence_number: string | undefined;
      if (links[0])
        occurrence_number = (
          await this.db.select<any[]>(
            'occurrences',
            `select=occurrence_number&tenant_id=eq.${tenant.id}&id=eq.${links[0].occurrence_id}&limit=1`,
          )
        )[0]?.occurrence_number;
      const haystack = [
        row.title,
        occurrence_number,
        ...messages.map((x) => x.body),
      ]
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      if (q && !haystack.includes(q.toLocaleLowerCase('pt-BR'))) continue;
      result.push({
        conversation_id: row.id,
        title: row.title,
        last_message_preview: String(messages[0]?.body ?? '').slice(0, 180),
        last_message_at: row.last_message_at,
        status: row.status,
        source_channel: row.channel,
        occurrence_number,
      });
    }
    return { conversations: result };
  }
  async conversation(slug: string, id: string, token: string) {
    const tenant = await this.tenant(slug),
      identity = await this.visitor(tenant.id, token),
      sessions = await this.db.select<any[]>(
        'public_chat_sessions',
        `select=conversation_id&tenant_id=eq.${tenant.id}&visitor_token_hash=eq.${this.hash(token)}&conversation_id=eq.${encodeURIComponent(id)}&limit=1`,
      );
    if (!sessions[0] && identity.contact_id) {
      const rows = await this.db.select<any[]>(
        'inbox_conversations',
        `select=id&tenant_id=eq.${tenant.id}&id=eq.${encodeURIComponent(id)}&contact_id=eq.${identity.contact_id}&channel=eq.public_chat&deleted_at=is.null&limit=1`,
      );
      if (!rows[0]) throw new UnauthorizedException('Conversa não autorizada.');
    } else if (!sessions[0])
      throw new UnauthorizedException('Conversa não autorizada.');
    return {
      conversation_id: id,
      messages: await this.messages(tenant.id, id),
    };
  }
  async attachment(
    slug: string,
    b: Record<string, unknown>,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    const tenant = await this.tenant(slug),
      session = await this.validateSession(
        tenant.id,
        this.text(b.session_id, 'session_id', 80),
        this.text(b.session_token, 'session_token', 200),
      );
    if (!this.inbox) throw new BadRequestException('Upload indisponível.');
    return this.inbox.uploadAttachment(
      tenant.id,
      session.conversation_id,
      'public_user',
      file,
    );
  }
}
