import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { DataContractsService } from './data-contracts.service';
@Controller('tenants/:tenantId')
@UseGuards(AuthGuard, PermissionsGuard)
export class DataContractFieldsController { constructor(private readonly service: DataContractsService) {}
@Patch('data-contract-fields/:fieldId') @RequirePermission('core.data_contract_fields.update') updateField(@Param('tenantId') tenantId: string, @Param('fieldId') fieldId: string, @Body() body: Record<string, unknown>) { return this.service.updateField(tenantId, fieldId, body); }
@Get('data-contract-fields/:fieldId/allowed-values') @RequirePermission('core.data_contract_fields.view') allowedValues(@Param('tenantId') tenantId: string, @Param('fieldId') fieldId: string) { return this.service.listAllowedValues(tenantId, fieldId); }
@Post('data-contract-fields/:fieldId/allowed-values') @RequirePermission('core.data_contract_fields.update') createAllowedValue(@Param('tenantId') tenantId: string, @Param('fieldId') fieldId: string, @Body() body: Record<string, unknown>) { return this.service.createAllowedValue(tenantId, fieldId, body); }
@Patch('data-contract-allowed-values/:allowedValueId') @RequirePermission('core.data_contract_fields.update') updateAllowedValue(@Param('tenantId') tenantId: string, @Param('allowedValueId') allowedValueId: string, @Body() body: Record<string, unknown>) { return this.service.updateAllowedValue(tenantId, allowedValueId, body); }}
