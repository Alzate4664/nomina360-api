import Decimal from 'decimal.js';

export interface PayrollRules {
  readonly minimumWage: Decimal;

  readonly salary: {
    readonly monthlyDayBasis: number;
  };

  readonly standardMonthlyHours: Decimal;

  readonly overtime: {
    readonly daytimeMultiplier: Decimal;
    readonly nighttimeMultiplier: Decimal;
  };

  readonly surcharges: {
    readonly nighttimeRate: Decimal;
    readonly sundayHolidayRate: Decimal;
  };

  readonly contributions: {
    readonly employeeHealthRate: Decimal;
    readonly employeePensionRate: Decimal;
  };

  readonly transportAllowance: {
    readonly monthlyAmount: Decimal;
    readonly salaryLimitInMinimumWages: Decimal;
    readonly monthlyProrationDayBasis: number;
  };

  readonly severance: {
    readonly daysPerYear: number;
    readonly interestAnnualRate: Decimal;
  };

  readonly serviceBonus: {
    readonly daysPerYear: number;
  };

  readonly sickLeave: {
    readonly monthlyIbcDayBasis: number;
    readonly commonDiseaseFirstRangeEndDay: number;
    readonly commonDiseaseFirstRate: Decimal;
    readonly commonDiseaseSecondRangeEndDay: number;
    readonly commonDiseaseSecondRate: Decimal;
    readonly workRiskRate: Decimal;
  };
}
