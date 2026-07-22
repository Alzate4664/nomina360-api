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

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly auditService: AuditService,
    private readonly createPayrollPeriodUseCase: CreatePayrollPeriodUseCase,
    private readonly findPayrollPeriodsUseCase: FindPayrollPeriodsUseCase,
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
    const existingPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        year,
        month,
      },
    });

    if (existingPeriod?.status === 'APPROVED') {
      throw new BadRequestException(
        'Este periodo ya fue aprobado y no se puede recalcular',
      );
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
      },
    });

    if (employees.length === 0) {
      throw new BadRequestException(
        'No existen colaboradores activos para calcular la nómina',
      );
    }

    let period = existingPeriod;

    if (!period) {
      period = await this.prisma.payrollPeriod.create({
        data: {
          companyId,
          year,
          month,
          status: 'DRAFT',
        },
      });
    }

    /*
     * Si el periodo ya había sido calculado, eliminamos el detalle anterior
     * antes de generar nuevamente la liquidación.
     */
    const existingItems = await this.prisma.payrollItem.findMany({
      where: {
        payrollPeriodId: period.id,
      },
      select: {
        id: true,
      },
    });

    const existingItemIds = existingItems.map((item) => item.id);

    if (existingItemIds.length > 0) {
      await this.prisma.payrollConceptDetail.deleteMany({
        where: {
          payrollItemId: {
            in: existingItemIds,
          },
        },
      });

      await this.prisma.payrollItem.deleteMany({
        where: {
          id: {
            in: existingItemIds,
          },
        },
      });
    }

    for (const employee of employees) {
      const novelties = await this.prisma.payrollNovelty.findMany({
        where: {
          companyId,
          employeeId: employee.id,
          periodYear: year,
          periodMonth: month,
        },
      });

      const calculation = this.calculator.calculate({
        baseSalary: Number(employee.baseSalary),
        workedDays: 30,
        novelties,
      });

      const payrollItem = await this.prisma.payrollItem.create({
        data: {
          companyId,
          payrollPeriodId: period.id,
          employeeId: employee.id,
          baseSalary: Number(employee.baseSalary),
          earnedTotal: calculation.earnedTotal,
          deductionsTotal: calculation.deductionsTotal,
          netPay: calculation.netPay,
        },
      });

      for (const concept of calculation.concepts) {
        await this.prisma.payrollConceptDetail.create({
          data: {
            payrollItemId: payrollItem.id,
            conceptCode: concept.code,
            conceptName: concept.name,
            type: concept.type as any,
            amount: concept.amount,
          },
        });
      }
    }

    period = await this.prisma.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: 'CALCULATED',
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CALCULATE_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: period.id,
      newValue: {
        year,
        month,
        status: period.status,
      },
    });

    return this.findOne(companyId, period.id);
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
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!period) {
      throw new NotFoundException('Periodo de nómina no encontrado');
    }

    if (period.status === 'APPROVED') {
      throw new BadRequestException('Este periodo ya fue aprobado');
    }

    if (period.status !== 'CALCULATED') {
      throw new BadRequestException(
        'La nómina debe estar calculada antes de aprobarse',
      );
    }

    const approvedPeriod = await this.prisma.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: currentUserId,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'APPROVE_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: approvedPeriod.id,
      oldValue: period,
      newValue: approvedPeriod,
    });

    return approvedPeriod;
  }

  async closePayroll(companyId: string, currentUserId: string, id: string) {
    return this.closePayrollPeriodUseCase.execute(companyId, currentUserId, id);
  }
}
