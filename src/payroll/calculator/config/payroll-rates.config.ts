export const PAYROLL_RATES = {
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
} as const;
