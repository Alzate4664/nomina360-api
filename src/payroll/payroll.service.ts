import { FindPayrollPeriodsUseCase } from './use-cases/find-payroll-periods.use-case';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';
import { ApprovePayrollPeriodUseCase } from './use-cases/approve-payroll-period.use-case';
import { CalculatePayrollUseCase } from './use-cases/calculate-payroll.use-case';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly auditService: AuditService,
    private readonly createPayrollPeriodUseCase: CreatePayrollPeriodUseCase,
    private readonly findPayrollPeriodsUseCase: FindPayrollPeriodsUseCase,
    private readonly calculatePayrollUseCase: CalculatePayrollUseCase,
    private readonly approvePayrollPeriodUseCase: ApprovePayrollPeriodUseCase,
    private readonly closePayrollPeriodUseCase: ClosePayrollPeriodUseCase,
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
  const payrollPeriodId =
    await this.calculatePayrollUseCase.execute(
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
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        items: {
          include: {
            employee: true,
            concepts: true,
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundException('Periodo de nómina no encontrado');
    }

    return period;
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
}
