import type { PayrollRulesPayloadV1 } from '../payroll-rules-codec';
import { parsePayrollRulesSnapshot } from '../payroll-rules-codec';
import { PayrollRuleSetDomainError } from './payroll-rule-set.errors';
import { createApprovedTemporalEnvelope } from './payroll-rule-set-temporal';
import type { ApprovedTemporalEnvelope } from './payroll-rule-set-temporal';

declare const reviewedSnapshotFingerprintBrand: unique symbol;
/** Future hashing produces sha256:<64 lowercase hexadecimal characters>. */
export type ReviewedSnapshotFingerprint = string & {
  readonly [reviewedSnapshotFingerprintBrand]: true;
};

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

export interface ReviewedSnapshotCanonicalInputV1 {
  readonly fingerprintFormat: 'payroll-reviewed-snapshot/v1';
  readonly jurisdictionCode: string;
  readonly version: number;
  readonly schemaVersion: 1;
  readonly rulesPayload: DeepReadonly<PayrollRulesPayloadV1>;
  readonly approvedTemporalEnvelope: ApprovedTemporalEnvelope;
}

function invalidContent(): never {
  throw new PayrollRuleSetDomainError(
    'INVALID_CANONICAL_CONTENT',
    'Canonical content must contain only finite JSON values and plain objects.',
  );
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number')
    return Number.isFinite(value) ? JSON.stringify(value) : invalidContent();
  if (typeof value !== 'object' || ancestors.has(value))
    return invalidContent();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (Array.isArray(value) && prototype !== Array.prototype)
    return invalidContent();
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  )
    return invalidContent();
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length > 0) return invalidContent();
    if (Array.isArray(value)) {
      if (Object.keys(descriptors).length !== value.length + 1)
        return invalidContent();
      for (let index = 0; index < value.length; index++) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
          return invalidContent();
      }
      return (
        '[' +
        Array.from({ length: value.length }, (_, index) =>
          serialize(descriptors[String(index)].value, ancestors),
        ).join(',') +
        ']'
      );
    }
    return (
      '{' +
      Object.keys(descriptors)
        .sort()
        .map((key) => {
          const descriptor = descriptors[key];
          if (!descriptor.enumerable || !('value' in descriptor))
            return invalidContent();
          return (
            JSON.stringify(key) + ':' + serialize(descriptor.value, ancestors)
          );
        })
        .join(',') +
      '}'
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Deterministic serialization of finite JSON values and plain objects only. */
export function serializeCanonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

/** Validates the snapshot but serializes the exact persisted payload representation.
 * Codec decoding is discarded to preserve decimal string spelling.
 * Revision and persistence/lifecycle metadata are deliberately excluded.
 */
export function serializeReviewedSnapshotV1(
  input: ReviewedSnapshotCanonicalInputV1,
): string {
  if (input.fingerprintFormat !== 'payroll-reviewed-snapshot/v1')
    return invalidContent();
  // Reject accessors and noncanonical objects before the codec reads fields.
  serializeCanonicalJson(input.rulesPayload);
  parsePayrollRulesSnapshot(input.schemaVersion, input.rulesPayload);
  const envelope = createApprovedTemporalEnvelope(
    input.approvedTemporalEnvelope.approvedEffectiveFrom,
    input.approvedTemporalEnvelope.approvedEffectiveTo,
  );
  return serializeCanonicalJson({
    fingerprintFormat: input.fingerprintFormat,
    jurisdictionCode: input.jurisdictionCode,
    version: input.version,
    schemaVersion: input.schemaVersion,
    rulesPayload: input.rulesPayload,
    approvedTemporalEnvelope: envelope,
  });
}
