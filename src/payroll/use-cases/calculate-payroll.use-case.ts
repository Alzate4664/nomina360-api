import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import { ConceptType, PayrollStatus, PayrollType } from '@prisma/client';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';

// In-memory result collected per eligible employee before the transaction opens.
// Concept fields use the calculator output shape { code, name, type, amount }.
// The mapping to DB column names (conceptCode, conceptName) happens at write time.
interface CalculatedEmployeeResult {
  employeeId: string;
  companyId: string;
  payrollPeriodId: string;
  baseSalary: number;
  earnedTotal: number;
  deductionsTotal: number;
  netPay: number;
  concepts: Array<{
    code: string;
    name: string;
    type: ConceptType;
    amount: number;
  }>;
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

    const existingPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
        year,
        month,
        payrollType,
      },
    });

    if (existingPeriod) {
      const allowedStatuses: PayrollStatus[] = [
        PayrollStatus.DRAFT,
        PayrollStatus.COLLECTING_NOVELTIES,
        PayrollStatus.CALCULATED,
        PayrollStatus.REOPENED,
      ];

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

      let calculation:
        | {
            earnedTotal: number;
            deductionsTotal: number;
            netPay: number;
            concepts: Array<{ code: string; name: string; type: ConceptType; amount: number }>;
          }
        | undefined;

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
          baseSalary: Number(employee.baseSalary),
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
          baseSalary: Number(employee.baseSalary),
          accruedDays,
        });
      } else {
        calculation = this.calculator.calculate({
          baseSalary: Number(employee.baseSalary),
          workedDays: 30,
          novelties,
        });
      }

      results.push({
        employeeId: employee.id,
        companyId,
        payrollPeriodId: period.id,
        baseSalary: Number(employee.baseSalary),
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
      // a) Delete previous items and concepts atomically with new inserts.
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

      // b) Insert new items and concepts.
      for (const result of results) {
        const payrollItem = await tx.payrollItem.create({
          data: {
            companyId: result.companyId,
            payrollPeriodId: result.payrollPeriodId,
            employeeId: result.employeeId,
            baseSalary: result.baseSalary,
            earnedTotal: result.earnedTotal,
            deductionsTotal: result.deductionsTotal,
            netPay: result.netPay,
          },
        });

        for (const concept of result.concepts) {
          await tx.payrollConceptDetail.create({
            data: {
              payrollItemId: payrollItem.id,
              conceptCode: concept.code,   // map: calculator code → DB conceptCode
              conceptName: concept.name,   // map: calculator name → DB conceptName
              type: concept.type,
              amount: concept.amount,
            },
          });
        }
      }

      // c) Promote period status inside the same transaction.
      const updatedPeriod = await tx.payrollPeriod.update({
        where: {
          id: period!.id,
        },
        data: {
          status: PayrollStatus.CALCULATED,
        },
      });

      // d) Write the audit record inside the transaction so it rolls back
      //    together with the financial writes if anything above fails.
      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CALCULATE_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: updatedPeriod.id,
          newValue: {
            year,
            month,
            status: updatedPeriod.status,
          },
        },
        tx,
      );
    });

    return period!.id;
  }
}
