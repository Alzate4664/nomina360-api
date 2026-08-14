import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
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

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
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
  ) {}

  calculate(input: {
    baseSalary: number;
    workedDays: number;
    novelties: PayrollNovelty[];
  }) {
    const dailySalary = input.baseSalary / 30;

    const sickLeaveResult = this.sickLeaveCalculator.calculate(input.novelties);

    const ordinaryWorkedDays = Math.max(
      input.workedDays - sickLeaveResult.days,
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

    const contributionBase =
      baseSalaryResult.earned +
      sickLeaveResult.earned +
      bonusResult.earned +
      overtimeResult.earned +
      nightSurchargeResult.earned +
      sundayHolidayResult.earned;

    const healthResult = this.healthCalculator.calculate(contributionBase);

    const pensionResult = this.pensionCalculator.calculate(contributionBase);

    const earnedTotal = contributionBase + transportAllowanceResult.earned;

    let deductionsTotal =
      absenceResult.deductions +
      deductionResult.deductions +
      healthResult.deductions +
      pensionResult.deductions;

    const concepts: PayrollConcept[] = [
      ...baseSalaryResult.concepts,
      ...sickLeaveResult.concepts,
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
      netPay: earnedTotal - deductionsTotal,
      concepts,
    };
  }
}
