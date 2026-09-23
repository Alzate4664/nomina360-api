import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';
import Decimal from 'decimal.js';
import { toDecimal } from '../money/decimal';
import {
  PayrollCalculationResult,
  PayrollConceptAmount,
} from '../money/payroll-money.types';

// In-memory result collected per eligible employee before the transaction opens.
// Concept fields use the calculator output shape { code, name, type, amount }.
// The mapping to DB column names (conceptCode, conceptName) happens at write time.
interface CalculatedEmployeeResult {
  employeeId: string;
  companyId: string;
  payrollPeriodId: string;
  baseSalary: Decimal;
  earnedTotal: Decimal;
  deductionsTotal: Decimal;
  netPay: Decimal;
  concepts: PayrollConceptAmount[];
}

@Injectable()
export class CalculatePayrollUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: PayrollCalculatorService,
    private readonly severancePayrollCalculator: SeverancePayrollCalculator,
    private readonly serviceBonusPayrollCalculator: ServiceBonusPayrollCalculator,
    private readonly accruedDaysCalculator: AccruedDaysCalculator,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    companyId: string,
    currentUserId: string,
    year: number,
    month: number,
    payrollType: PayrollType,
  ) {
    // ─── PHASE 1: reads, guards, and in-memory calculations ────────────────────
    // Reads and calculations stay outside the transaction.
    // The only intentional write in this phase is creating a missing DRAFT period.

    const allowedStatuses: PayrollStatus[] = [
      PayrollStatus.DRAFT,
      PayrollStatus.COLLECTING_NOVELTIES,
      PayrollStatus.CALCULATED,
      PayrollStatus.REOPENED,
    ];

    const existingPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        year,
        month,
        payrollType,
      },
    });

    if (existingPeriod) {
      if (!allowedStatuses.includes(existingPeriod.status)) {
        throw new BadRequestException(
          `El período en estado ${existingPeriod.status} no puede calcularse ni recalcularse`,
        );
      }
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

    // Create the period in DRAFT if it does not exist yet.
    // It remains outside the transaction intentionally so a failed first
    // calculation leaves an identifiable DRAFT period without financial results.
    let period = existingPeriod;

    if (!period) {
      period = await this.prisma.payrollPeriod.create({
        data: {
          companyId,
          year,
          month,
          payrollType,
          status: PayrollStatus.DRAFT,
        },
      });
    }

    // Collect existing item IDs so the transaction can delete them atomically.
    const existingItems = await this.prisma.payrollItem.findMany({
      where: {
        payrollPeriodId: period.id,
      },
      select: {
        id: true,
      },
    });

    const existingItemIds = existingItems.map((item) => item.id);

    // Run all calculations in memory — no DB writes until the transaction opens.
    const results: CalculatedEmployeeResult[] = [];

    for (const employee of employees) {
      const novelties = await this.prisma.payrollNovelty.findMany({
        where: {
          companyId,
          employeeId: employee.id,
          payrollPeriodId: period.id,
        },
      });

      const baseSalary = toDecimal(employee.baseSalary);

      let calculation: PayrollCalculationResult;

      if (payrollType === PayrollType.SEVERANCE) {
        const accruedDays = this.accruedDaysCalculator.calculate(
          employee.startDate,
          year,
          month,
        );

        if (accruedDays <= 0) {
          continue;
        }

        calculation = this.severancePayrollCalculator.calculate({
          baseSalary,
          accruedDays,
        });
      } else if (payrollType === PayrollType.BONUS) {
        const semesterStartMonth = month <= 6 ? 1 : 7;

        const accruedDays = this.accruedDaysCalculator.calculate(
          employee.startDate,
          year,
          month,
          semesterStartMonth,
        );

        if (accruedDays <= 0) {
          continue;
        }

        calculation = this.serviceBonusPayrollCalculator.calculate({
          baseSalary,
          accruedDays,
        });
      } else {
        calculation = this.calculator.calculate({
          baseSalary,
          workedDays: 30,
          novelties,
        });
      }

      results.push({
        employeeId: employee.id,
        companyId,
        payrollPeriodId: period.id,
        baseSalary,
        earnedTotal: calculation.earnedTotal,
        deductionsTotal: calculation.deductionsTotal,
        netPay: calculation.netPay,
        concepts: calculation.concepts,
      });
    }

    // ─── PHASE 2: atomic persistence ──────────────────────────────────────────
    // All DB writes are inside a single transaction.
    // If any write fails the entire transaction rolls back:
    //   - old items/concepts are NOT partially deleted;
    //   - new items/concepts are NOT partially inserted;
    //   - PayrollPeriod.status is NOT updated;
    //   - the AuditLog record is NOT written.

    await this.prisma.$transaction(async (tx) => {
      // a) Claim the period using optimistic concurrency control.
      const transition = await tx.payrollPeriod.updateMany({
        where: {
          id: period.id,
          companyId,
          version: period.version,
          status: {
            in: allowedStatuses,
          },
        },
        data: {
          status: PayrollStatus.CALCULATED,
          version: {
            increment: 1,
          },
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'El período de nómina cambió mientras se calculaba. Vuelve a cargarlo e intenta nuevamente',
        );
      }
      // b) Delete previous items and concepts atomically with new inserts.
      if (existingItemIds.length > 0) {
        await tx.payrollConceptDetail.deleteMany({
          where: {
            payrollItemId: {
              in: existingItemIds,
            },
          },
        });

        await tx.payrollItem.deleteMany({
          where: {
            id: {
              in: existingItemIds,
            },
          },
        });
      }

      // c) Insert new items and concepts.
      for (const result of results) {
        const payrollItem = await tx.payrollItem.create({
          data: {
            companyId: result.companyId,
            payrollPeriodId: result.payrollPeriodId,
            employeeId: result.employeeId,
            baseSalary: result.baseSalary.toString(),
            earnedTotal: result.earnedTotal.toString(),
            deductionsTotal: result.deductionsTotal.toString(),
            netPay: result.netPay.toString(),
          },
        });

        for (const concept of result.concepts) {
          await tx.payrollConceptDetail.create({
            data: {
              payrollItemId: payrollItem.id,
              conceptCode: concept.code, // map: calculator code → DB conceptCode
              conceptName: concept.name, // map: calculator name → DB conceptName
              type: concept.type,
              amount: concept.amount.toString(),
            },
          });
        }
      }

      // d) Write the audit record inside the transaction
      //    together with the financial writes if anything above fails.
      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CALCULATE_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: period.id,
          newValue: {
            year,
            month,
            status: PayrollStatus.CALCULATED,
            version: period.version + 1,
          },
        },
        tx,
      );
    });

    return period.id;
  }
}
