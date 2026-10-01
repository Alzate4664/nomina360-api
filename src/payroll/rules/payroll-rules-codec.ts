import Decimal from 'decimal.js';
import type { PayrollRules } from './payroll-rules';

export const PAYROLL_RULES_SCHEMA_VERSION = 1 as const;

export interface PayrollRulesPayloadV1 {
  minimumWage: string;

  salary: {
    monthlyDayBasis: number;
  };

  standardMonthlyHours: string;

  overtime: {
    daytimeMultiplier: string;
    nighttimeMultiplier: string;
  };

  surcharges: {
    nighttimeRate: string;
    sundayHolidayRate: string;
  };

  contributions: {
    employeeHealthRate: string;
    employeePensionRate: string;
  };

  transportAllowance: {
    monthlyAmount: string;
    salaryLimitInMinimumWages: string;
    monthlyProrationDayBasis: number;
  };

  severance: {
    daysPerYear: number;
    interestAnnualRate: string;
  };

  serviceBonus: {
    daysPerYear: number;
  };

  sickLeave: {
    monthlyIbcDayBasis: number;
    commonDiseaseFirstRangeEndDay: number;
    commonDiseaseFirstRate: string;
    commonDiseaseSecondRangeEndDay: number;
    commonDiseaseSecondRate: string;
    workRiskRate: string;
  };
}

export class PayrollRulesPayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollRulesPayloadValidationError';
  }
}

export function parsePayrollRulesSnapshot(
  schemaVersion: number,
  payload: unknown,
): PayrollRules {
  if (schemaVersion !== PAYROLL_RULES_SCHEMA_VERSION) {
    throw new PayrollRulesPayloadValidationError(
      `Unsupported payroll rules schema version: ${schemaVersion}`,
    );
  }

  return parsePayrollRulesPayloadV1(payload);
}

export function serializePayrollRulesV1(
  rules: PayrollRules,
): PayrollRulesPayloadV1 {
  return {
    minimumWage: rules.minimumWage.toString(),

    salary: {
      monthlyDayBasis: rules.salary.monthlyDayBasis,
    },

    standardMonthlyHours: rules.standardMonthlyHours.toString(),

    overtime: {
      daytimeMultiplier: rules.overtime.daytimeMultiplier.toString(),
      nighttimeMultiplier: rules.overtime.nighttimeMultiplier.toString(),
    },

    surcharges: {
      nighttimeRate: rules.surcharges.nighttimeRate.toString(),
      sundayHolidayRate: rules.surcharges.sundayHolidayRate.toString(),
    },

    contributions: {
      employeeHealthRate: rules.contributions.employeeHealthRate.toString(),
      employeePensionRate: rules.contributions.employeePensionRate.toString(),
    },

    transportAllowance: {
      monthlyAmount: rules.transportAllowance.monthlyAmount.toString(),
      salaryLimitInMinimumWages:
        rules.transportAllowance.salaryLimitInMinimumWages.toString(),
      monthlyProrationDayBasis:
        rules.transportAllowance.monthlyProrationDayBasis,
    },

    severance: {
      daysPerYear: rules.severance.daysPerYear,
      interestAnnualRate: rules.severance.interestAnnualRate.toString(),
    },

    serviceBonus: {
      daysPerYear: rules.serviceBonus.daysPerYear,
    },

    sickLeave: {
      monthlyIbcDayBasis: rules.sickLeave.monthlyIbcDayBasis,
      commonDiseaseFirstRangeEndDay:
        rules.sickLeave.commonDiseaseFirstRangeEndDay,
      commonDiseaseFirstRate: rules.sickLeave.commonDiseaseFirstRate.toString(),
      commonDiseaseSecondRangeEndDay:
        rules.sickLeave.commonDiseaseSecondRangeEndDay,
      commonDiseaseSecondRate:
        rules.sickLeave.commonDiseaseSecondRate.toString(),
      workRiskRate: rules.sickLeave.workRiskRate.toString(),
    },
  };
}

function parsePayrollRulesPayloadV1(payload: unknown): PayrollRules {
  const root = requireExactObject(payload, 'rulesPayload', [
    'minimumWage',
    'salary',
    'standardMonthlyHours',
    'overtime',
    'surcharges',
    'contributions',
    'transportAllowance',
    'severance',
    'serviceBonus',
    'sickLeave',
  ]);

  const salary = requireExactObject(root.salary, 'salary', ['monthlyDayBasis']);

  const overtime = requireExactObject(root.overtime, 'overtime', [
    'daytimeMultiplier',
    'nighttimeMultiplier',
  ]);

  const surcharges = requireExactObject(root.surcharges, 'surcharges', [
    'nighttimeRate',
    'sundayHolidayRate',
  ]);

  const contributions = requireExactObject(
    root.contributions,
    'contributions',
    ['employeeHealthRate', 'employeePensionRate'],
  );

  const transportAllowance = requireExactObject(
    root.transportAllowance,
    'transportAllowance',
    ['monthlyAmount', 'salaryLimitInMinimumWages', 'monthlyProrationDayBasis'],
  );

  const severance = requireExactObject(root.severance, 'severance', [
    'daysPerYear',
    'interestAnnualRate',
  ]);

  const serviceBonus = requireExactObject(root.serviceBonus, 'serviceBonus', [
    'daysPerYear',
  ]);

  const sickLeave = requireExactObject(root.sickLeave, 'sickLeave', [
    'monthlyIbcDayBasis',
    'commonDiseaseFirstRangeEndDay',
    'commonDiseaseFirstRate',
    'commonDiseaseSecondRangeEndDay',
    'commonDiseaseSecondRate',
    'workRiskRate',
  ]);

  const firstRangeEndDay = requirePositiveInteger(
    sickLeave.commonDiseaseFirstRangeEndDay,
    'sickLeave.commonDiseaseFirstRangeEndDay',
  );

  const secondRangeEndDay = requirePositiveInteger(
    sickLeave.commonDiseaseSecondRangeEndDay,
    'sickLeave.commonDiseaseSecondRangeEndDay',
  );

  if (secondRangeEndDay <= firstRangeEndDay) {
    throw new PayrollRulesPayloadValidationError(
      'sickLeave.commonDiseaseSecondRangeEndDay must be greater than sickLeave.commonDiseaseFirstRangeEndDay',
    );
  }

  return {
    minimumWage: requirePositiveDecimal(root.minimumWage, 'minimumWage'),

    salary: {
      monthlyDayBasis: requirePositiveInteger(
        salary.monthlyDayBasis,
        'salary.monthlyDayBasis',
      ),
    },

    standardMonthlyHours: requirePositiveDecimal(
      root.standardMonthlyHours,
      'standardMonthlyHours',
    ),

    overtime: {
      daytimeMultiplier: requirePositiveDecimal(
        overtime.daytimeMultiplier,
        'overtime.daytimeMultiplier',
      ),
      nighttimeMultiplier: requirePositiveDecimal(
        overtime.nighttimeMultiplier,
        'overtime.nighttimeMultiplier',
      ),
    },

    surcharges: {
      nighttimeRate: requireNonNegativeDecimal(
        surcharges.nighttimeRate,
        'surcharges.nighttimeRate',
      ),
      sundayHolidayRate: requireNonNegativeDecimal(
        surcharges.sundayHolidayRate,
        'surcharges.sundayHolidayRate',
      ),
    },

    contributions: {
      employeeHealthRate: requireUnitIntervalDecimal(
        contributions.employeeHealthRate,
        'contributions.employeeHealthRate',
      ),
      employeePensionRate: requireUnitIntervalDecimal(
        contributions.employeePensionRate,
        'contributions.employeePensionRate',
      ),
    },

    transportAllowance: {
      monthlyAmount: requireNonNegativeDecimal(
        transportAllowance.monthlyAmount,
        'transportAllowance.monthlyAmount',
      ),
      salaryLimitInMinimumWages: requirePositiveDecimal(
        transportAllowance.salaryLimitInMinimumWages,
        'transportAllowance.salaryLimitInMinimumWages',
      ),
      monthlyProrationDayBasis: requirePositiveInteger(
        transportAllowance.monthlyProrationDayBasis,
        'transportAllowance.monthlyProrationDayBasis',
      ),
    },

    severance: {
      daysPerYear: requirePositiveInteger(
        severance.daysPerYear,
        'severance.daysPerYear',
      ),
      interestAnnualRate: requireNonNegativeDecimal(
        severance.interestAnnualRate,
        'severance.interestAnnualRate',
      ),
    },

    serviceBonus: {
      daysPerYear: requirePositiveInteger(
        serviceBonus.daysPerYear,
        'serviceBonus.daysPerYear',
      ),
    },

    sickLeave: {
      monthlyIbcDayBasis: requirePositiveInteger(
        sickLeave.monthlyIbcDayBasis,
        'sickLeave.monthlyIbcDayBasis',
      ),
      commonDiseaseFirstRangeEndDay: firstRangeEndDay,
      commonDiseaseFirstRate: requireUnitIntervalDecimal(
        sickLeave.commonDiseaseFirstRate,
        'sickLeave.commonDiseaseFirstRate',
      ),
      commonDiseaseSecondRangeEndDay: secondRangeEndDay,
      commonDiseaseSecondRate: requireUnitIntervalDecimal(
        sickLeave.commonDiseaseSecondRate,
        'sickLeave.commonDiseaseSecondRate',
      ),
      workRiskRate: requireUnitIntervalDecimal(
        sickLeave.workRiskRate,
        'sickLeave.workRiskRate',
      ),
    },
  };
}

function requireExactObject(
  value: unknown,
  path: string,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PayrollRulesPayloadValidationError(`${path} must be an object`);
  }

  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new PayrollRulesPayloadValidationError(
      `${path} contains an invalid set of fields`,
    );
  }

  return record;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be a positive integer`,
    );
  }

  return value as number;
}

function requireDecimal(value: unknown, path: string): Decimal {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be a decimal string`,
    );
  }

  let decimal: Decimal;

  try {
    decimal = new Decimal(value);
  } catch {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be a valid decimal string`,
    );
  }

  if (!decimal.isFinite()) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be a finite decimal`,
    );
  }

  return decimal;
}

function requirePositiveDecimal(value: unknown, path: string): Decimal {
  const decimal = requireDecimal(value, path);

  if (!decimal.isPositive()) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be greater than zero`,
    );
  }

  return decimal;
}

function requireNonNegativeDecimal(value: unknown, path: string): Decimal {
  const decimal = requireDecimal(value, path);

  if (decimal.isNegative()) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be greater than or equal to zero`,
    );
  }

  return decimal;
}

function requireUnitIntervalDecimal(value: unknown, path: string): Decimal {
  const decimal = requireNonNegativeDecimal(value, path);

  if (decimal.greaterThan(1)) {
    throw new PayrollRulesPayloadValidationError(
      `${path} must be between zero and one`,
    );
  }

  return decimal;
}
