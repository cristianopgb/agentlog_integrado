import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { OccurrencesService } from './occurrences.service';

@Controller('tenants/:tenantId/occurrences')
@UseGuards(AuthGuard, PermissionsGuard)
export class OccurrencesController {
  constructor(private readonly service: OccurrencesService) {}
  @Get() @RequirePermission('occurrences.view') list(
    @Param('tenantId') tenantId: string,
    @Query() query: Record<string, string>,
  ) {
    return this.service.list(tenantId, query);
  }
  @Get('operation-options')
  @RequirePermission('occurrences.view')
  operationOptions(
    @Param('tenantId') tenantId: string,
    @Query('search') search: string,
  ) {
    return this.service.operationOptions(tenantId, search);
  }
  @Get('reason-categories')
  @RequirePermission('occurrence_reasons.view')
  categories(@Param('tenantId') tenantId: string) {
    return this.service.listReasonCategories(tenantId);
  }
  @Get('reasons') @RequirePermission('occurrence_reasons.view') reasons(
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.listReasons(tenantId);
  }
  @Get('reasons/:reasonId/requirements')
  @RequirePermission('occurrence_reasons.view')
  requirements(
    @Param('tenantId') tenantId: string,
    @Param('reasonId') reasonId: string,
    @Query('stage') stage: string,
  ) {
    return this.service.reasonRequirements(tenantId, reasonId, stage);
  }
  @Post() @RequirePermission('occurrences.create') create(
    @Param('tenantId') tenantId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.create(tenantId, req.user.id, body);
  }
  @Get('kanban') @RequirePermission('occurrences.kanban.view') kanban(
    @Param('tenantId') tenantId: string,
  ) {
    return this.service.kanban(tenantId);
  }
  @Get(':id') @RequirePermission('occurrences.view') detail(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.detail(tenantId, id);
  }
  @Get(':id/items') @RequirePermission('occurrence_items.view') listItems(
    @Param('tenantId') t: string,
    @Param('id') o: string,
  ) {
    return this.service.listItems(t, o);
  }
  @Post(':id/items') @RequirePermission('occurrence_items.create') createItem(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.createItem(t, o, r.user.id, b);
  }
  @Patch(':id/items/:itemId')
  @RequirePermission('occurrence_items.update')
  updateItem(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('itemId') x: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.updateItem(t, o, r.user.id, x, b);
  }
  @Delete(':id/items/:itemId')
  @RequirePermission('occurrence_items.delete')
  deleteItem(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('itemId') x: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteItem(t, o, r.user.id, x);
  }
  @Get(':id/financial-entries')
  @RequirePermission('occurrence_financial_entries.view')
  listFinancial(@Param('tenantId') t: string, @Param('id') o: string) {
    return this.service.listFinancialEntries(t, o);
  }
  @Post(':id/financial-entries')
  @RequirePermission('occurrence_financial_entries.create')
  createFinancial(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.createFinancialEntry(t, o, r.user.id, b);
  }
  @Patch(':id/financial-entries/:entryId')
  @RequirePermission('occurrence_financial_entries.update')
  updateFinancial(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('entryId') x: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.updateFinancialEntry(t, o, r.user.id, x, b);
  }
  @Delete(':id/financial-entries/:entryId')
  @RequirePermission('occurrence_financial_entries.delete')
  deleteFinancial(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('entryId') x: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteFinancialEntry(t, o, r.user.id, x);
  }
  @Get(':id/documents')
  @RequirePermission('occurrence_documents.view')
  listDocuments(@Param('tenantId') t: string, @Param('id') o: string) {
    return this.service.listDocuments(t, o);
  }
  @Post(':id/documents')
  @RequirePermission('occurrence_documents.create')
  createDocument(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.createDocument(t, o, r.user.id, b);
  }
  @Patch(':id/documents/:documentId')
  @RequirePermission('occurrence_documents.update')
  updateDocument(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('documentId') x: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.updateDocument(t, o, r.user.id, x, b);
  }
  @Delete(':id/documents/:documentId')
  @RequirePermission('occurrence_documents.delete')
  deleteDocument(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('documentId') x: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteDocument(t, o, r.user.id, x);
  }
  @Get(':id/attachments')
  @RequirePermission('occurrence_attachments.view')
  listAttachments(@Param('tenantId') t: string, @Param('id') o: string) {
    return this.service.listAttachments(t, o);
  }
  @Post(':id/attachments')
  @RequirePermission('occurrence_attachments.create')
  createAttachment(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Req() r: AuthenticatedRequest,
    @Body() b: Record<string, unknown>,
  ) {
    return this.service.createAttachment(t, o, r.user.id, b);
  }
  @Delete(':id/attachments/:attachmentId')
  @RequirePermission('occurrence_attachments.delete')
  deleteAttachment(
    @Param('tenantId') t: string,
    @Param('id') o: string,
    @Param('attachmentId') x: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteAttachment(t, o, r.user.id, x);
  }
  @Patch(':id/status')
  @RequirePermission(['occurrences.update', 'occurrences.kanban.move'])
  status(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.changeStatus(tenantId, id, req.user.id, body);
  }
  @Patch(':id/assign') @RequirePermission('occurrences.assign') assign(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.assign(tenantId, id, req.user.id, body);
  }
  @Post(':id/events') @RequirePermission('occurrence_events.create') event(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.addEvent(tenantId, id, req.user.id, body);
  }
  @Post(':id/operation-links')
  @RequirePermission('occurrence_operation_links.create')
  link(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.addOperationLink(tenantId, id, req.user.id, body);
  }
  @Delete(':id/operation-links/:linkId')
  @RequirePermission('occurrence_operation_links.delete')
  unlink(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.service.removeOperationLink(tenantId, id, linkId);
  }
}
