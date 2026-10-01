import {
  PAYROLL_RULES_SCHEMA_VERSION,
  PayrollRulesPayloadValidationError,
  parsePayrollRulesSnapshot,
  serializePayrollRulesV1,
} from './payroll-rules-codec';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';

describe('payroll rules codec', () => {
  it('should round-trip the default rules without losing payload values', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const parsed = parsePayrollRulesSnapshot(
      PAYROLL_RULES_SCHEMA_VERSION,
      payload,
    );

    expect(serializePayrollRulesV1(parsed)).toEqual(payload);
  });

  it('should serialize Decimal values as strings', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    expect(typeof payload.minimumWage).toBe('string');
    expect(typeof payload.overtime.daytimeMultiplier).toBe('string');
    expect(typeof payload.contributions.employeeHealthRate).toBe('string');
  });

  it('should reject unsupported schema versions', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    expect(() => parsePayrollRulesSnapshot(2, payload)).toThrow(
      PayrollRulesPayloadValidationError,
    );
  });

  it('should reject missing fields', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);
    const invalidPayload = { ...payload };
    delete (invalidPayload as Partial<typeof payload>).minimumWage;

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject unknown fields', () => {
    const payload = {
      ...serializePayrollRulesV1(DEFAULT_PAYROLL_RULES),
      unexpectedField: 'unexpected',
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, payload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject numeric Decimal values instead of strings', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      minimumWage: 1750905,
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject invalid sick leave range ordering', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      sickLeave: {
        ...payload.sickLeave,
        commonDiseaseFirstRangeEndDay: 180,
        commonDiseaseSecondRangeEndDay: 90,
      },
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject contribution rates outside the unit interval', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      contributions: {
        ...payload.contributions,
        employeeHealthRate: '1.01',
      },
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject non-positive day bases', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      salary: {
        ...payload.salary,
        monthlyDayBasis: 0,
      },
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject invalid decimal strings', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      minimumWage: 'not-a-decimal',
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject fractional integer rule values', () => {
    const payload = serializePayrollRulesV1(DEFAULT_PAYROLL_RULES);

    const invalidPayload = {
      ...payload,
      salary: {
        ...payload.salary,
        monthlyDayBasis: 30.5,
      },
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });
});
