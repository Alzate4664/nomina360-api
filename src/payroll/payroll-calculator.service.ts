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
  ) {}

  calculate(input: {
    baseSalary: number;
    workedDays: number;
    novelties: PayrollNovelty[];
  }) {
    const dailySalary = input.baseSalary / 30;

    const baseSalaryResult = this.baseSalaryCalculator.calculate(
      input.baseSalary,
      input.workedDays,
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

    const absenceResult = this.absenceCalculator.calculate(
      dailySalary,
      input.novelties,
    );

    const deductionResult = this.deductionCalculator.calculate(input.novelties);

    let earnedTotal =
      baseSalaryResult.earned +
      bonusResult.earned +
      overtimeResult.earned +
      nightSurchargeResult.earned +
      sundayHolidayResult.earned;

    const healthResult = this.healthCalculator.calculate(earnedTotal);

    const pensionResult = this.pensionCalculator.calculate(earnedTotal);

    let deductionsTotal =
      absenceResult.deductions +
      deductionResult.deductions +
      healthResult.deductions;
    +pensionResult.deductions;

    const concepts: PayrollConcept[] = [
      ...baseSalaryResult.concepts,
      ...bonusResult.concepts,
      ...overtimeResult.concepts,
      ...nightSurchargeResult.concepts,
      ...sundayHolidayResult.concepts,
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
