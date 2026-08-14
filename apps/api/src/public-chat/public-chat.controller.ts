import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PublicChatService } from './public-chat.service';

@Controller('public/:tenantSlug/chat')
export class PublicChatController {
  constructor(private readonly service: PublicChatService) {}
  @Post('start') start(
    @Param('tenantSlug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.start(slug, body);
  }
  @Get('conversations') conversations(
    @Param('tenantSlug') slug: string,
    @Query('token') token: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.conversations(slug, token, search, limit);
  }
  @Get('conversations/:conversationId') conversation(
    @Param('tenantSlug') slug: string,
    @Param('conversationId') id: string,
    @Query('token') token: string,
  ) {
    return this.service.conversation(slug, id, token);
  }
  @Post('messages') message(
    @Param('tenantSlug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.message(slug, body);
  }
  @Get('session/:sessionId') session(
    @Param('tenantSlug') slug: string,
    @Param('sessionId') id: string,
    @Query('token') token: string,
  ) {
    return this.service.session(slug, id, token);
  }
  @Post('attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize:
          (Number(process.env.INBOX_ATTACHMENT_MAX_MB) || 10) * 1024 * 1024,
      },
    }),
  )
  attachment(
    @Param('tenantSlug') slug: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) throw new BadRequestException('Selecione um arquivo.');
    return this.service.attachment(slug, body, file);
  }
}
