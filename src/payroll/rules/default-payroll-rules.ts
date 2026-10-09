import Decimal from 'decimal.js';
import { PayrollRules } from './payroll-rules';

export const DEFAULT_PAYROLL_RULES: PayrollRules = {
  minimumWage: new Decimal('1750905'),

  salary: {
    monthlyDayBasis: 30,
  },

  standardMonthlyHours: new Decimal('210'),

  overtime: {
    daytimeMultiplier: new Decimal('1.25'),
    nighttimeMultiplier: new Decimal('1.75'),
  },

  surcharges: {
    nighttimeRate: new Decimal('0.35'),
    sundayHolidayRate: new Decimal('0.9'),
  },

  contributions: {
    employeeHealthRate: new Decimal('0.04'),
    employeePensionRate: new Decimal('0.04'),
  },

  transportAllowance: {
    monthlyAmount: new Decimal('249095'),
    salaryLimitInMinimumWages: new Decimal('2'),
    monthlyProrationDayBasis: 30,
  },

  severance: {
    daysPerYear: 360,
    interestAnnualRate: new Decimal('0.12'),
  },

  serviceBonus: {
    daysPerYear: 360,
  },

  sickLeave: {
    commonDiseaseFirstRangeEndDay: 90,
    commonDiseaseFirstRate: new Decimal(2).dividedBy(3),
    commonDiseaseSecondRangeEndDay: 180,
    commonDiseaseSecondRate: new Decimal('0.5'),
    workRiskRate: new Decimal('1'),
    monthlyIbcDayBasis: 30,
  },
};
