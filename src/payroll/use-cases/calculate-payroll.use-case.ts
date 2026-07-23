import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollCalculatorService } from '../payroll-calculator.service';

@Injectable()
export class CalculatePayrollUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly auditService: AuditService,
  ) {}

  async execute(
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

    return period.id;
  }
}