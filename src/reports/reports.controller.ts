import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('payroll-monthly')
  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  async payrollMonthly(
    @CurrentUser() user: any,
    @Query('year') year: string,
    @Query('month') month: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateMonthlyPayrollReport(
      user.companyId,
      Number(year),
      Number(month),
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=nomina-${year}-${month}.xlsx`,
    );

    res.send(buffer);
  }
}