import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RbacService } from '../rbac/rbac.service';
import { InboxService } from './inbox.service';

@Controller('tenants/:tenantId/inbox/conversations')
@UseGuards(AuthGuard, PermissionsGuard)
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly rbac: RbacService,
  ) {}
  @Get() @RequirePermission('occurrences.inbox.view') list(
    @Param('tenantId') tenant: string,
    @Query() query: Record<string, string>,
  ) {
    return this.inbox.list(tenant, query);
  }
  @Get(':id') @RequirePermission('occurrences.inbox.view') detail(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
  ) {
    return this.inbox.detail(tenant, id);
  }
  @Post(':id/messages')
  @RequirePermission([
    'occurrences.inbox.reply',
    'occurrences.inbox.create_message',
  ])
  message(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inbox.createMessage(tenant, id, req.user.id, body);
  }
  @Post(':id/attachments')
  @RequirePermission([
    'occurrences.inbox.reply',
    'occurrences.inbox.create_message',
  ])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize:
          (Number(process.env.INBOX_ATTACHMENT_MAX_MB) || 10) * 1024 * 1024,
      },
    }),
  )
  attachment(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) throw new BadRequestException('Selecione um arquivo.');
    return this.inbox.uploadAttachment(
      tenant,
      id,
      'internal_user',
      file,
      undefined,
      req.user.id,
    );
  }
  @Patch(':id/assign') @RequirePermission('occurrences.inbox.assign') assign(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inbox.assign(tenant, id, req.user.id, body);
  }
  @Patch(':id/status')
  @RequirePermission(['occurrences.inbox.assign', 'occurrences.inbox.close'])
  async status(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const status = body.status;
    await this.rbac.ensurePermission(
      req.user.id,
      tenant,
      status === 'closed' || status === 'archived'
        ? ['occurrences.inbox.close']
        : ['occurrences.inbox.assign'],
      'any',
    );
    return this.inbox.changeStatus(tenant, id, req.user.id, body);
  }
  @Post(':id/occurrence-links')
  @RequirePermission('occurrences.inbox.link_occurrence')
  link(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inbox.linkOccurrence(tenant, id, req.user.id, body);
  }
  @Delete(':id/occurrence-links/:linkId')
  @RequirePermission('occurrences.inbox.link_occurrence')
  unlink(
    @Param('tenantId') tenant: string,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inbox.unlinkOccurrence(tenant, id, linkId, req.user.id);
  }
}

@Controller('external/inbox')
export class ExternalInboxController {
  constructor(private readonly inbox: InboxService) {}
  @Post('messages') intake(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.inbox.externalMessage(authorization, body);
  }
}
