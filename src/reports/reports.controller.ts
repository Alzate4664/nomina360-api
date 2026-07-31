import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PayrollType } from '@prisma/client';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @ApiQuery({ name: 'year', type: Number })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({
    name: 'payrollType',
    enum: PayrollType,
    example: PayrollType.MONTHLY,
  })
  @Get('payroll-monthly')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  async payrollMonthly(
    @CurrentUser() user: any,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('payrollType') payrollType: PayrollType,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateMonthlyPayrollReport(
      user.companyId,
      Number(year),
      Number(month),
      payrollType,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=nomina-${year}-${month}-${payrollType}.xlsx`,
    );

    res.send(buffer);
  }
}
