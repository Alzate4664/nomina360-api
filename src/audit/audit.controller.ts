import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { parsePositiveInteger } from '../common/utils/pagination.util';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({ summary: 'Consultar registros de auditoría' })
  @ApiQuery({
    name: 'action',
    required: false,
    example: 'REOPEN_PAYROLL',
  })
  @ApiQuery({
    name: 'entity',
    required: false,
    example: 'PayrollPeriod',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    example: '3e0960b1-267a-40f2-a570-673043ba74d3',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
  })
  @Get()
  @Roles('OWNER', 'ADMIN')
  findAll(
    @CurrentUser() user: any,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll(
      user.companyId,
      action,
      entity,
      userId,
      parsePositiveInteger(page, 'page', 1),
      parsePositiveInteger(limit, 'limit', 20, 100),
    );
  }
}
