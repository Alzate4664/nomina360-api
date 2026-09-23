import { Injectable } from '@nestjs/common';
import { PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { AbsenceCalculator } from './calculator/concepts/absence.calculator';
import { BaseSalaryCalculator } from './calculator/concepts/base-salary.calculator';
import { BonusCalculator } from './calculator/concepts/bonus.calculator';
import { DeductionCalculator } from './calculator/concepts/deduction.calculator';
import { HealthCalculator } from './calculator/concepts/health.calculator';
import { PensionCalculator } from './calculator/concepts/pension.calculator';
import { OvertimeCalculator } from './calculator/concepts/overtime.calculator';
import { NightSurchargeCalculator } from './calculator/concepts/night-surcharge.calculator';
import { SundayHolidayCalculator } from './calculator/concepts/sunday-holiday.calculator';
import { TransportAllowanceCalculator } from './calculator/concepts/transport-allowance.calculator';
import { SickLeaveCalculator } from './calculator/concepts/sick-leave.calculator';
import { VacationCalculator } from './calculator/concepts/vacation.calculator';
import { LeaveCalculator } from './calculator/concepts/leave.calculator';
import {
  PayrollCalculationResult,
  PayrollConceptAmount,
} from './money/payroll-money.types';

interface PayrollCalculatorInput {
  baseSalary: Decimal;
  workedDays: number;
  novelties: PayrollNovelty[];
}

@Injectable()
export class PayrollCalculatorService {
  constructor(
    private readonly baseSalaryCalculator: BaseSalaryCalculator,
    private readonly bonusCalculator: BonusCalculator,
    private readonly absenceCalculator: AbsenceCalculator,
    private readonly deductionCalculator: DeductionCalculator,
    private readonly healthCalculator: HealthCalculator,
    private readonly pensionCalculator: PensionCalculator,
    private readonly overtimeCalculator: OvertimeCalculator,
    private readonly nightSurchargeCalculator: NightSurchargeCalculator,
    private readonly sundayHolidayCalculator: SundayHolidayCalculator,
    private readonly transportAllowanceCalculator: TransportAllowanceCalculator,
    private readonly sickLeaveCalculator: SickLeaveCalculator,
    private readonly vacationCalculator: VacationCalculator,
    private readonly leaveCalculator: LeaveCalculator,
  ) {}

  calculate(input: PayrollCalculatorInput): PayrollCalculationResult {
    const dailySalary = input.baseSalary.dividedBy(30);

    const sickLeaveResult = this.sickLeaveCalculator.calculate(input.novelties);

    const vacationResult = this.vacationCalculator.calculate(
      input.baseSalary,
      input.novelties,
    );

    const leaveResult = this.leaveCalculator.calculate(
      input.baseSalary,
      input.novelties,
    );

    const ordinaryWorkedDays = Decimal.max(
      new Decimal(input.workedDays)
        .minus(sickLeaveResult.days)
        .minus(vacationResult.days)
        .minus(leaveResult.days),
      0,
    );

    const baseSalaryResult = this.baseSalaryCalculator.calculate(
      input.baseSalary,
      ordinaryWorkedDays,
    );

    const bonusResult = this.bonusCalculator.calculate(input.novelties);

    const overtimeResult = this.overtimeCalculator.calculate(
      input.baseSalary,
      input.novelties,
    );

    const nightSurchargeResult = this.nightSurchargeCalculator.calculate(
      input.baseSalary,
      input.novelties,
    );

    const sundayHolidayResult = this.sundayHolidayCalculator.calculate(
      input.baseSalary,
      input.novelties,
    );

    const transportAllowanceResult =
      this.transportAllowanceCalculator.calculate(
        input.baseSalary,
        ordinaryWorkedDays,
      );

    const absenceResult = this.absenceCalculator.calculate(
      dailySalary,
      input.novelties,
    );

    const deductionResult = this.deductionCalculator.calculate(input.novelties);

    const contributionBase = baseSalaryResult.earned
      .plus(sickLeaveResult.earned)
      .plus(vacationResult.earned)
      .plus(leaveResult.earned)
      .plus(bonusResult.earned)
      .plus(overtimeResult.earned)
      .plus(nightSurchargeResult.earned)
      .plus(sundayHolidayResult.earned);

    const healthResult = this.healthCalculator.calculate(contributionBase);

    const pensionResult = this.pensionCalculator.calculate(contributionBase);

    const earnedTotal = contributionBase.plus(transportAllowanceResult.earned);

    const deductionsTotal = absenceResult.deductions
      .plus(deductionResult.deductions)
      .plus(healthResult.deductions)
      .plus(pensionResult.deductions);

    const concepts: PayrollConceptAmount[] = [
      ...baseSalaryResult.concepts,
      ...sickLeaveResult.concepts,
      ...vacationResult.concepts,
      ...leaveResult.concepts,
      ...bonusResult.concepts,
      ...overtimeResult.concepts,
      ...nightSurchargeResult.concepts,
      ...sundayHolidayResult.concepts,
      ...transportAllowanceResult.concepts,
      ...absenceResult.concepts,
      ...deductionResult.concepts,
      ...healthResult.concepts,
      ...pensionResult.concepts,
    ];

    return {
      earnedTotal,
      deductionsTotal,
      netPay: earnedTotal.minus(deductionsTotal),
      concepts,
    };
  }
}
