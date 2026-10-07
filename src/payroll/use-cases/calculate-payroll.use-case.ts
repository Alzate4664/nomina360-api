import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import {
  PayrollStatus,
  PayrollType,
  type PayrollNovelty,
  type PayrollPeriod,
} from '@prisma/client';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';
import Decimal from 'decimal.js';
import { toDecimal } from '../money/decimal';
import {
  PayrollCalculationResult,
  PayrollConceptAmount,
} from '../money/payroll-money.types';
import { DEFAULT_PAYROLL_RULES } from '../rules/default-payroll-rules';
import {
  hasPayrollPeriodRuleSetPolicy,
  PayrollRuleSetSelectionError,
  PayrollRuleSetSelectionPolicy,
  type SelectedPayrollRuleSet,
} from '../rules/payroll-rule-set-selection.policy';
import { PayrollRulesResolutionError } from '../rules/payroll-rules-resolver';

const INITIAL_PAYROLL_JURISDICTION_CODE = 'CO';

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
    private readonly payrollRuleSetSelectionPolicy: PayrollRuleSetSelectionPolicy,
  ) {}

  async execute(
    companyId: string,
    currentUserId: string,
    payrollPeriodId: string,
  ) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: payrollPeriodId,
        companyId,
      },
    });

    if (!period) {
      throw new NotFoundException('Periodo de nómina no encontrado');
    }

    return this.calculatePeriod(companyId, currentUserId, period);
  }

  async executeLegacy(
    companyId: string,
    currentUserId: string,
    year: number,
    month: number,
    payrollType: PayrollType,
  ) {
    const periods = await this.prisma.payrollPeriod.findMany({
      where: {
        companyId,
        year,
        month,
        payrollType,
      },
      take: 2,
    });

    if (periods.length === 0) {
      throw new NotFoundException(
        'Periodo de nómina no encontrado. Debe crearse antes de calcularlo.',
      );
    }

    if (periods.length > 1) {
      throw new BadRequestException(
        'Existen múltiples períodos de nómina para los datos enviados. Use el identificador del período para calcularlo.',
      );
    }

    return this.calculatePeriod(companyId, currentUserId, periods[0]);
  }

  private async calculatePeriod(
    companyId: string,
    currentUserId: string,
    period: PayrollPeriod,
  ) {
    const { year, month, payrollType } = period;

    // PHASE 1: read-only guards and in-memory calculations.
    const allowedStatuses: PayrollStatus[] = [
      PayrollStatus.DRAFT,
      PayrollStatus.COLLECTING_NOVELTIES,
      PayrollStatus.CALCULATED,
      PayrollStatus.REOPENED,
    ];

    if (!allowedStatuses.includes(period.status)) {
      throw new BadRequestException(
        `El período en estado ${period.status} no puede calcularse ni recalcularse`,
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

    let selectedRuleSet: SelectedPayrollRuleSet | null = null;

    if (hasPayrollPeriodRuleSetPolicy(payrollType)) {
      try {
        selectedRuleSet =
          await this.payrollRuleSetSelectionPolicy.selectForPayrollPeriod(
            INITIAL_PAYROLL_JURISDICTION_CODE,
            {
              payrollType,
              startDate: period.startDate,
              endDate: period.endDate,
              calculatedRuleSetId: period.calculatedRuleSetId,
            },
          );
      } catch (error) {
        if (
          error instanceof PayrollRuleSetSelectionError &&
          error.code === 'PAYROLL_PERIOD_SPANS_MULTIPLE_RULE_SETS'
        ) {
          throw new ConflictException(
            'El período de nómina cruza múltiples configuraciones de reglas vigentes y no puede calcularse como un único período',
          );
        }

        if (
          error instanceof PayrollRuleSetSelectionError &&
          error.code === 'PAYROLL_PERIOD_DATES_REQUIRED'
        ) {
          throw new ConflictException(
            'El período de nómina no tiene las fechas requeridas para determinar las reglas aplicables',
          );
        }

        if (
          error instanceof PayrollRuleSetSelectionError &&
          error.code === 'PAYROLL_PERIOD_DATE_RANGE_INVALID'
        ) {
          throw new ConflictException(
            'El período de nómina tiene un rango de fechas inválido y no puede calcularse',
          );
        }

        if (
          error instanceof PayrollRulesResolutionError &&
          error.code === 'RULE_SET_NOT_FOUND'
        ) {
          throw new ConflictException(
            'No existe una configuración de reglas de nómina publicada aplicable a las fechas de este período',
          );
        }

        throw error;
      }
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

    const shouldLoadNovelties =
      payrollType !== PayrollType.SEVERANCE &&
      payrollType !== PayrollType.BONUS;

    const employeeIds = employees.map((employee) => employee.id);

    const novelties: PayrollNovelty[] = shouldLoadNovelties
      ? await this.prisma.payrollNovelty.findMany({
          where: {
            companyId,
            payrollPeriodId: period.id,
            employeeId: {
              in: employeeIds,
            },
          },
        })
      : [];

    const noveltiesByEmployeeId = new Map<string, PayrollNovelty[]>();

    for (const novelty of novelties) {
      const employeeNovelties = noveltiesByEmployeeId.get(novelty.employeeId);

      if (employeeNovelties) {
        employeeNovelties.push(novelty);
      } else {
        noveltiesByEmployeeId.set(novelty.employeeId, [novelty]);
      }
    }

    // Run all calculations in memory — no DB writes until the transaction opens.
    const results: CalculatedEmployeeResult[] = [];

    for (const employee of employees) {
      const employeeNovelties = noveltiesByEmployeeId.get(employee.id) ?? [];

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
          rules: DEFAULT_PAYROLL_RULES,
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
          rules: DEFAULT_PAYROLL_RULES,
        });
      } else {
        calculation = this.calculator.calculate({
          baseSalary,
          workedDays: 30,
          novelties: employeeNovelties,
          rules: selectedRuleSet?.rules ?? DEFAULT_PAYROLL_RULES,
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
          ...(selectedRuleSet
            ? {
                calculatedRuleSetId: selectedRuleSet.ruleSetId,
              }
            : {}),
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

      // c) Insert new items and concepts in batches.
      if (results.length > 0) {
        const createdPayrollItems = await tx.payrollItem.createManyAndReturn({
          data: results.map((result) => ({
            companyId: result.companyId,
            payrollPeriodId: result.payrollPeriodId,
            employeeId: result.employeeId,
            baseSalary: result.baseSalary.toString(),
            earnedTotal: result.earnedTotal.toString(),
            deductionsTotal: result.deductionsTotal.toString(),
            netPay: result.netPay.toString(),
          })),
          select: {
            id: true,
            employeeId: true,
          },
        });

        const payrollItemIdByEmployeeId = new Map(
          createdPayrollItems.map((item) => [item.employeeId, item.id]),
        );

        const conceptRows = results.flatMap((result) => {
          const payrollItemId = payrollItemIdByEmployeeId.get(
            result.employeeId,
          );

          if (!payrollItemId) {
            throw new Error(
              `No se encontró el PayrollItem creado para el colaborador ${result.employeeId}`,
            );
          }

          return result.concepts.map((concept) => ({
            payrollItemId,
            conceptCode: concept.code,
            conceptName: concept.name,
            type: concept.type,
            amount: concept.amount.toString(),
          }));
        });

        if (conceptRows.length > 0) {
          await tx.payrollConceptDetail.createMany({
            data: conceptRows,
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
            ...(selectedRuleSet
              ? {
                  calculatedRuleSetId: selectedRuleSet.ruleSetId,
                }
              : {}),
          },
        },
        tx,
      );
    });

    return period.id;
  }
}
