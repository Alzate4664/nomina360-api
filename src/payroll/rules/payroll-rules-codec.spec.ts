import {
  PAYROLL_RULES_SCHEMA_VERSION,
  PayrollRulesPayloadValidationError,
  parsePayrollRulesSnapshot,
  serializePayrollRulesSnapshot,
} from './payroll-rules-codec';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';

describe('payroll rules codec', () => {
  const serializePayload = () =>
    serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES).rulesPayload;

  it('should round-trip the default rules without losing snapshot values', () => {
    const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

    const parsed = parsePayrollRulesSnapshot(
      snapshot.schemaVersion,
      snapshot.rulesPayload,
    );

    expect(serializePayrollRulesSnapshot(parsed)).toEqual(snapshot);
  });

  it('should couple the V1 payload with its schema version', () => {
    const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

    expect(snapshot.schemaVersion).toBe(PAYROLL_RULES_SCHEMA_VERSION);
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.rulesPayload).toBeDefined();
  });

  it('should serialize Decimal values as strings', () => {
    const payload = serializePayload();

    expect(typeof payload.minimumWage).toBe('string');
    expect(typeof payload.overtime.daytimeMultiplier).toBe('string');
    expect(typeof payload.contributions.employeeHealthRate).toBe('string');
  });

  it('should reject unsupported schema versions', () => {
    const payload = serializePayload();

    expect(() => parsePayrollRulesSnapshot(2, payload)).toThrow(
      PayrollRulesPayloadValidationError,
    );
  });

  it('should reject missing fields', () => {
    const payload = serializePayload();
    const invalidPayload = { ...payload };
    delete (invalidPayload as Partial<typeof payload>).minimumWage;

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject unknown fields', () => {
    const payload = {
      ...serializePayload(),
      unexpectedField: 'unexpected',
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, payload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject numeric Decimal values instead of strings', () => {
    const payload = serializePayload();

    const invalidPayload = {
      ...payload,
      minimumWage: 1750905,
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject invalid sick leave range ordering', () => {
    const payload = serializePayload();

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
    const payload = serializePayload();

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
    const payload = serializePayload();

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
    const payload = serializePayload();

    const invalidPayload = {
      ...payload,
      minimumWage: 'not-a-decimal',
    };

    expect(() =>
      parsePayrollRulesSnapshot(PAYROLL_RULES_SCHEMA_VERSION, invalidPayload),
    ).toThrow(PayrollRulesPayloadValidationError);
  });

  it('should reject fractional integer rule values', () => {
    const payload = serializePayload();

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
