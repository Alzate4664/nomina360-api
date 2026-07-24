import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CalculatePayrollDto } from './dto/calculate-payroll.dto';
import { PayrollService } from './payroll.service';
import {
  parseOptionalInteger,
  parsePositiveInteger,
} from '../common/utils/pagination.util';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth()
@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('calculate')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  calculate(@CurrentUser() user: any, @Body() dto: CalculatePayrollDto) {
    return this.payrollService.calculatePayroll(
      user.companyId,
      user.sub,
      dto.year,
      dto.month,
    );
  }

  @Post('periods')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  createPayrollPeriod(@Body() dto: CreatePayrollPeriodDto) {
    return this.payrollService.createPayrollPeriod(dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('status') status?: string,
  ) {
    return this.payrollService.findAll(
      user.companyId,
      parsePositiveInteger(page, 'page', 1),
      parsePositiveInteger(limit, 'limit', 20, 100),
      parseOptionalInteger(year, 'year', 2000, 2100),
      parseOptionalInteger(month, 'month', 1, 12),
      status,
    );
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.findOne(user.companyId, id);
  }

  @Post(':id/approve')
  @Roles('OWNER', 'ADMIN')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.approvePayroll(user.companyId, user.sub, id);
  }

  @Post(':id/close')
  @Roles('OWNER', 'ADMIN')
  close(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.closePayroll(user.companyId, user.sub, id);
  }

  @Post(':id/reopen')
  @Roles('OWNER', 'ADMIN')
  reopen(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payrollService.reopenPayroll(user.companyId, user.sub, id);
  }
}
