import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DataContractsService } from './data-contracts.service';
@Controller('tenants/:tenantId/data-contracts')
@UseGuards(AuthGuard, PermissionsGuard)
export class DataContractsController { constructor(private readonly service: DataContractsService) {}
@Get() @RequirePermission('core.data_contracts.view') list(@Param('tenantId') tenantId: string) { return this.service.listContracts(tenantId); }
@Post() @RequirePermission('core.data_contracts.create') create(@Param('tenantId') tenantId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.createContract(tenantId, req.user.id, body); }
@Get(':contractId') @RequirePermission('core.data_contracts.view') get(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string) { return this.service.getContract(tenantId, contractId); }
@Patch(':contractId') @RequirePermission('core.data_contracts.update') update(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string, @Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.updateContract(tenantId, contractId, req.user.id, body); }
@Get(':contractId/fields') @RequirePermission('core.data_contract_fields.view') fields(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string) { return this.service.listFields(tenantId, contractId); }
@Post(':contractId/fields') @RequirePermission('core.data_contract_fields.update') createField(@Param('tenantId') tenantId: string, @Param('contractId') contractId: string, @Body() body: Record<string, unknown>) { return this.service.createField(tenantId, contractId, body); }}
