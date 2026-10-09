import Decimal from 'decimal.js';
import { PayrollRulesPayloadValidationError } from '../payroll-rules-codec';
import {
  serializeCanonicalJson,
  serializeReviewedSnapshotV1,
} from './payroll-rule-set-fingerprint';
import type { ReviewedSnapshotCanonicalInputV1 } from './payroll-rule-set-fingerprint';
import { createApprovedTemporalEnvelope } from './payroll-rule-set-temporal';

// Representation fixture only: these values are not legal or default payroll rules.
function fixture(): ReviewedSnapshotCanonicalInputV1 {
  return {
    fingerprintFormat: 'payroll-reviewed-snapshot/v1',
    jurisdictionCode: 'TEST',
    version: 1,
    schemaVersion: 1,
    rulesPayload: {
      minimumWage: '1',
      salary: { monthlyDayBasis: 1 },
      standardMonthlyHours: '1',
      overtime: { daytimeMultiplier: '1', nighttimeMultiplier: '1' },
      surcharges: { nighttimeRate: '1', sundayHolidayRate: '1' },
      contributions: { employeeHealthRate: '1', employeePensionRate: '1' },
      transportAllowance: {
        monthlyAmount: '1',
        salaryLimitInMinimumWages: '1',
        monthlyProrationDayBasis: 1,
      },
      severance: { daysPerYear: 1, interestAnnualRate: '1' },
      serviceBonus: { daysPerYear: 1 },
      sickLeave: {
        monthlyIbcDayBasis: 1,
        commonDiseaseFirstRangeEndDay: 1,
        commonDiseaseFirstRate: '1',
        commonDiseaseSecondRangeEndDay: 2,
        commonDiseaseSecondRate: '1',
        workRiskRate: '1',
      },
    },
    approvedTemporalEnvelope: createApprovedTemporalEnvelope(
      '0001-01-01',
      null,
    ),
  };
}

function withPayload(value: unknown): ReviewedSnapshotCanonicalInputV1 {
  return {
    ...fixture(),
    rulesPayload: value as ReviewedSnapshotCanonicalInputV1['rulesPayload'],
  };
}

function reverseKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reverseKeys);
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]: [string, unknown]) => [key, reverseKeys(item)]),
  );
}

describe('reviewed snapshot canonical serialization', () => {
  it('has a fixed compact canonical representation and explicit null', () => {
    expect(serializeReviewedSnapshotV1(fixture())).toBe(
      '{"approvedTemporalEnvelope":{"approvedEffectiveFrom":"0001-01-01","approvedEffectiveTo":null},"fingerprintFormat":"payroll-reviewed-snapshot/v1","jurisdictionCode":"TEST","rulesPayload":{"contributions":{"employeeHealthRate":"1","employeePensionRate":"1"},"minimumWage":"1","overtime":{"daytimeMultiplier":"1","nighttimeMultiplier":"1"},"salary":{"monthlyDayBasis":1},"serviceBonus":{"daysPerYear":1},"severance":{"daysPerYear":1,"interestAnnualRate":"1"},"sickLeave":{"commonDiseaseFirstRangeEndDay":1,"commonDiseaseFirstRate":"1","commonDiseaseSecondRangeEndDay":2,"commonDiseaseSecondRate":"1","monthlyIbcDayBasis":1,"workRiskRate":"1"},"standardMonthlyHours":"1","surcharges":{"nighttimeRate":"1","sundayHolidayRate":"1"},"transportAllowance":{"monthlyAmount":"1","monthlyProrationDayBasis":1,"salaryLimitInMinimumWages":"1"}},"schemaVersion":1,"version":1}',
    );
  });
  it('sorts nested keys independently of insertion order', () => {
    expect(
      serializeReviewedSnapshotV1(
        reverseKeys(fixture()) as ReviewedSnapshotCanonicalInputV1,
      ),
    ).toBe(serializeReviewedSnapshotV1(fixture()));
  });
  it('uses lexical rather than locale or numeric key order', () => {
    expect(serializeCanonicalJson({ z: 1, a: 1, A: 1, '2': 1, '10': 1 })).toBe(
      '{"10":1,"2":1,"A":1,"a":1,"z":1}',
    );
  });
  it('preserves array order and exact string representation', () => {
    expect(serializeCanonicalJson(['1', '1.0'])).toBe('["1","1.0"]');
    expect(serializeCanonicalJson(['1', '1.0'])).not.toBe(
      serializeCanonicalJson(['1.0', '1']),
    );
    expect(serializeCanonicalJson({ value: ' é\n' })).toBe('{"value":" é\\n"}');
  });
  it('rejects unsupported schema using codec error semantics', () => {
    expect(() =>
      serializeReviewedSnapshotV1({
        ...fixture(),
        schemaVersion: 2,
      } as unknown as ReviewedSnapshotCanonicalInputV1),
    ).toThrow(PayrollRulesPayloadValidationError);
  });
  it.each([
    null,
    [],
    {},
    { ...fixture().rulesPayload, minimumWage: 'invalid' },
    { ...fixture().rulesPayload, minimumWage: 1 },
    { ...fixture().rulesPayload, extra: 'field' },
    { ...fixture().rulesPayload, salary: {} },
    { ...fixture().rulesPayload, salary: { monthlyDayBasis: 1, extra: 1 } },
  ])('rejects malformed, incomplete or extra-field payload %#', (payload) => {
    expect(() => serializeReviewedSnapshotV1(withPayload(payload))).toThrow(
      PayrollRulesPayloadValidationError,
    );
  });
  it('rejects payload accessors without executing them', () => {
    const getter = jest.fn(() => '1');
    const payload = Object.defineProperty(
      { ...fixture().rulesPayload },
      'minimumWage',
      {
        enumerable: true,
        get: getter,
      },
    );
    expect(() => serializeReviewedSnapshotV1(withPayload(payload))).toThrow(
      expect.objectContaining({ code: 'INVALID_CANONICAL_CONTENT' }) as Error,
    );
    expect(getter).not.toHaveBeenCalled();
  });
  it('does not mutate generic canonical source objects', () => {
    const input = Object.freeze({
      z: Object.freeze([null, true, 2]),
      a: 'exact',
    });
    const before = JSON.stringify(input);
    expect(serializeCanonicalJson(input)).toBe(
      '{"a":"exact","z":[null,true,2]}',
    );
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each([
    { jurisdictionCode: 'OTHER' },
    { version: 2 },

    { rulesPayload: { ...fixture().rulesPayload, minimumWage: '1.0' } },
    {
      approvedTemporalEnvelope: createApprovedTemporalEnvelope(
        '0001-01-02',
        null,
      ),
    },
    {
      approvedTemporalEnvelope: createApprovedTemporalEnvelope(
        '0001-01-01',
        '9999-12-31',
      ),
    },
  ])('is sensitive to included field %j', (change) => {
    expect(
      serializeReviewedSnapshotV1({
        ...fixture(),
        ...change,
      }),
    ).not.toBe(serializeReviewedSnapshotV1(fixture()));
  });
  it('rejects an unsupported fingerprint format', () => {
    expect(() =>
      serializeReviewedSnapshotV1({
        ...fixture(),
        fingerprintFormat: 'other',
      } as unknown as ReviewedSnapshotCanonicalInputV1),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_CANONICAL_CONTENT',
      }) as Error,
    );
  });
  it('constructs only allowed review fields, excluding persistence and schedule metadata', () => {
    const input = {
      ...fixture(),
      id: 'excluded',
      draftRevision: 2,
      status: 'DRAFT',
      publishedAt: null,
      createdAt: 'excluded',
      updatedAt: 'excluded',
      applicability: 'excluded',
    };
    expect(serializeReviewedSnapshotV1(input)).toBe(
      serializeReviewedSnapshotV1(fixture()),
    );
  });
  it.each([
    new Date('2024-01-01'),
    new Decimal('1'),
    undefined,
    NaN,
    Infinity,
    -Infinity,
    new (class Example {
      value = 1;
    })(),
    { nested: undefined },
    [undefined],
  ])('rejects noncanonical content %#', (value) => {
    expect(() => serializeCanonicalJson(value)).toThrow(
      expect.objectContaining({
        code: 'INVALID_CANONICAL_CONTENT',
      }) as Error,
    );
  });
  it('rejects cycles, sparse arrays and accessor properties', () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => '1',
    });
    for (const value of [cycle, new Array(1), accessor]) {
      expect(() => serializeCanonicalJson(value)).toThrow(
        expect.objectContaining({
          code: 'INVALID_CANONICAL_CONTENT',
        }) as Error,
      );
    }
  });
  it('does not mutate source objects', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    Object.freeze(input.rulesPayload);
    Object.freeze(input);
    serializeReviewedSnapshotV1(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
