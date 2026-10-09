import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformScopeGuard } from '../../common/guards/platform-scope.guard';
import { ListPayrollRuleSetsQueryDto } from './dto/list-payroll-rule-sets-query.dto';
import { PayrollRuleSetQueryService } from './payroll-rule-set-query.service';

@ApiTags('Platform Payroll Rule Sets')
@ApiBearerAuth()
@Controller('platform/payroll-rule-sets')
@UseGuards(JwtAuthGuard, PlatformScopeGuard)
export class PlatformPayrollRuleSetsController {
  constructor(private readonly queryService: PayrollRuleSetQueryService) {}

  @Get()
  findAll(@Query() query: ListPayrollRuleSetsQueryDto) {
    return this.queryService.findAll({
      jurisdictionCode: query.jurisdictionCode,
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
}
