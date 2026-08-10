import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PublicChatService } from './public-chat.service';

@Controller('public/:tenantSlug/chat')
export class PublicChatController {
 constructor(private readonly service:PublicChatService){}
 @Post('start') start(@Param('tenantSlug') slug:string,@Body() body:Record<string,unknown>){return this.service.start(slug,body);}
 @Post('messages') message(@Param('tenantSlug') slug:string,@Body() body:Record<string,unknown>){return this.service.message(slug,body);}
 @Get('session/:sessionId') session(@Param('tenantSlug') slug:string,@Param('sessionId') id:string,@Query('token') token:string){return this.service.session(slug,id,token);}
}
