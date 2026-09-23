import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { AccruedDaysCalculator } from './accrued-days.calculator';
import { BaseSalaryCalculator } from './concepts/base-salary.calculator';
import { TerminationVacationCalculator } from './concepts/termination-vacation.calculator';
import { ServiceBonusPayrollCalculator } from './service-bonus-payroll.calculator';
import { SeverancePayrollCalculator } from './severance-payroll.calculator';
import { PayrollConceptAmount } from '../money/payroll-money.types';

interface TerminationPayrollInput {
  baseSalary: Decimal;
  employeeStartDate: Date;
  terminationDate: Date;
  unpaidSalaryStartDate: Date;
  pendingVacationDays: Decimal;
}

@Injectable()
export class TerminationPayrollCalculator {
  constructor(
    private readonly baseSalaryCalculator: BaseSalaryCalculator,
    private readonly accruedDaysCalculator: AccruedDaysCalculator,
    private readonly severancePayrollCalculator: SeverancePayrollCalculator,
    private readonly serviceBonusPayrollCalculator: ServiceBonusPayrollCalculator,
    private readonly terminationVacationCalculator: TerminationVacationCalculator,
  ) {}

  calculate(input: TerminationPayrollInput) {
    const salaryDays = this.accruedDaysCalculator.calculateUntilDate(
      input.unpaidSalaryStartDate,
      input.terminationDate,
    );

    const salaryResult = this.baseSalaryCalculator.calculate(
      input.baseSalary,
      new Decimal(salaryDays),
    );

    const terminationYear = input.terminationDate.getUTCFullYear();

    const severancePeriodStart = new Date(Date.UTC(terminationYear, 0, 1));

    const severanceDays = this.accruedDaysCalculator.calculateUntilDate(
      input.employeeStartDate,
      input.terminationDate,
      severancePeriodStart,
    );

    const severanceResult = this.severancePayrollCalculator.calculate({
      baseSalary: input.baseSalary,
      accruedDays: severanceDays,
    });

    const terminationMonth = input.terminationDate.getUTCMonth() + 1;

    const semesterStartMonth = terminationMonth <= 6 ? 1 : 7;

    const serviceBonusPeriodStart = new Date(
      Date.UTC(terminationYear, semesterStartMonth - 1, 1),
    );

    const serviceBonusDays = this.accruedDaysCalculator.calculateUntilDate(
      input.employeeStartDate,
      input.terminationDate,
      serviceBonusPeriodStart,
    );

    const serviceBonusResult = this.serviceBonusPayrollCalculator.calculate({
      baseSalary: input.baseSalary,
      accruedDays: serviceBonusDays,
    });

    const vacationResult = this.terminationVacationCalculator.calculate(
      input.baseSalary,
      input.pendingVacationDays,
    );

    const concepts: PayrollConceptAmount[] = [
      ...salaryResult.concepts,
      ...severanceResult.concepts,
      ...serviceBonusResult.concepts,
      ...vacationResult.concepts,
    ];

    const earnedTotal = salaryResult.earned
      .plus(severanceResult.earnedTotal)
      .plus(serviceBonusResult.earnedTotal)
      .plus(vacationResult.earned);

    return {
      salaryDays,
      severanceDays,
      serviceBonusDays,

      salary: salaryResult.earned,
      severance: severanceResult.earnedTotal,
      serviceBonus: serviceBonusResult.earnedTotal,
      vacation: vacationResult.earned,

      earnedTotal,
      concepts,
    };
  }
}
