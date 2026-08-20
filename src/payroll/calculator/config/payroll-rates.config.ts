export const PAYROLL_RATES = {
  minimumWage: 1750905,

  standardMonthlyHours: 210,

  overtime: {
    daytimeMultiplier: 1.25,
    nighttimeMultiplier: 1.75,
  },

  surcharges: {
    nighttimeRate: 0.35,
    sundayHolidayRate: 0.9,
  },

  schedule: {
    daytimeStartsAtHour: 6,
    nighttimeStartsAtHour: 19,
  },

  contributions: {
    employeeHealthRate: 0.04,
    employeePensionRate: 0.04,
  },

  transportAllowance: {
    monthlyAmount: 249095,
    salaryLimitInMinimumWages: 2,
  },

  severance: {
    daysPerYear: 360,
    interestAnnualRate: 0.12,
  },
} as const;
