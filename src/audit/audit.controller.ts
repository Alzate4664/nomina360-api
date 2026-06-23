import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditService } from './audit.service';
import { parsePositiveInteger } from '../common/utils/pagination.util';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

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