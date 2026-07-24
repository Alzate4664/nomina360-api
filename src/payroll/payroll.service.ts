import { Injectable } from '@nestjs/common';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { ApprovePayrollPeriodUseCase } from './use-cases/approve-payroll-period.use-case';
import { CalculatePayrollUseCase } from './use-cases/calculate-payroll.use-case';
import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';
import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';
import { FindPayrollPeriodsUseCase } from './use-cases/find-payroll-periods.use-case';
import { FindPayrollPeriodUseCase } from './use-cases/find-payroll-period.use-case';
import { ReopenPayrollPeriodUseCase } from './use-cases/reopen-payroll-period.use-case';

@Injectable()
export class PayrollService {
  constructor(
    private readonly createPayrollPeriodUseCase: CreatePayrollPeriodUseCase,
    private readonly findPayrollPeriodsUseCase: FindPayrollPeriodsUseCase,
    private readonly findPayrollPeriodUseCase: FindPayrollPeriodUseCase,
    private readonly calculatePayrollUseCase: CalculatePayrollUseCase,
    private readonly approvePayrollPeriodUseCase: ApprovePayrollPeriodUseCase,
    private readonly closePayrollPeriodUseCase: ClosePayrollPeriodUseCase,
    private readonly reopenPayrollPeriodUseCase: ReopenPayrollPeriodUseCase,
  ) {}

  async createPayrollPeriod(dto: CreatePayrollPeriodDto) {
    return this.createPayrollPeriodUseCase.execute(dto);
  }

  async calculatePayroll(
    companyId: string,
    currentUserId: string,
    year: number,
    month: number,
  ) {
    const payrollPeriodId = await this.calculatePayrollUseCase.execute(
      companyId,
      currentUserId,
      year,
      month,
    );

    return this.findOne(companyId, payrollPeriodId);
  }

  async findAll(
    companyId: string,
    page = 1,
    limit = 20,
    year?: number,
    month?: number,
    status?: string,
  ) {
    return this.findPayrollPeriodsUseCase.execute(
      companyId,
      page,
      limit,
      year,
      month,
      status,
    );
  }

  async findOne(companyId: string, id: string) {
    return this.findPayrollPeriodUseCase.execute(companyId, id);
  }

  async approvePayroll(companyId: string, currentUserId: string, id: string) {
    return this.approvePayrollPeriodUseCase.execute(
      companyId,
      currentUserId,
      id,
    );
  }

  async closePayroll(companyId: string, currentUserId: string, id: string) {
    return this.closePayrollPeriodUseCase.execute(companyId, currentUserId, id);
  }

  async reopenPayroll(companyId: string, currentUserId: string, id: string) {
    return this.reopenPayrollPeriodUseCase.execute(
      companyId,
      currentUserId,
      id,
    );
  }
}
