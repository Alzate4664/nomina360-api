import type {
  ApplicabilityId,
  ExpectedApplicability,
  RuleSelectionEvidence,
} from './payroll-rule-set-applicability';
import {
  createApplicabilityRevision,
  createDraftRevision,
} from './payroll-rule-set-revision';
import { parseBusinessDate } from './payroll-rule-set-temporal';
import type {
  ValidationIssue,
  ValidationLayerOutcome,
  ValidationSubject,
  DraftRevisionBinding,
} from './payroll-rule-set-validation';
import type { ReviewedSnapshotFingerprint } from './payroll-rule-set-fingerprint';

type AssertFalse<T extends false> = T;
type Unpinned = Extract<RuleSelectionEvidence, { kind: 'UNPINNED' }>;
type Pinned = Extract<RuleSelectionEvidence, { kind: 'PINNED' }>;
type ContractAssertions = [
  AssertFalse<
    readonly [] extends Unpinned['expectedApplicability'] ? true : false
  >,
  AssertFalse<
    {
      kind: 'PINNED';
      expectedApplicability: readonly [ExpectedApplicability];
    } extends Pinned
      ? true
      : false
  >,
  AssertFalse<
    { code: 'OTHER'; message: string } extends ValidationIssue<'TEST_ISSUE'>
      ? true
      : false
  >,
  AssertFalse<
    {
      layer: 'OPERATIONAL_LEGAL_REVIEW';
      status: 'PASSED';
      issues: readonly [];
    } extends ValidationLayerOutcome
      ? true
      : false
  >,
];
const contractAssertions: ContractAssertions = [false, false, false, false];

type Fingerprinted = Extract<ValidationSubject, { kind: 'FINGERPRINTED' }>;
type Unfingerprintable = Extract<
  ValidationSubject,
  { kind: 'UNFINGERPRINTABLE' }
>;
type SubjectAssertions = [
  AssertFalse<
    { kind: 'FINGERPRINTED'; draft: DraftRevisionBinding } extends Fingerprinted
      ? true
      : false
  >,
  AssertFalse<
    {
      kind: 'FINGERPRINTED';
      reviewedSnapshotFingerprint: ReviewedSnapshotFingerprint;
    } extends Fingerprinted
      ? true
      : false
  >,
  AssertFalse<
    {
      kind: 'FINGERPRINTED';
      draft: null;
      reviewedSnapshotFingerprint: ReviewedSnapshotFingerprint;
    } extends Fingerprinted
      ? true
      : false
  >,
  AssertFalse<
    'reviewedSnapshotFingerprint' extends keyof Unfingerprintable ? true : false
  >,
];
const subjectAssertions: SubjectAssertions = [false, false, false, false];

describe('applicability and validation contracts', () => {
  it('requires bound fingerprint evidence and permits unfingerprintable previews', () => {
    expect(subjectAssertions).toEqual([false, false, false, false]);
    const unbound: ValidationSubject = {
      kind: 'UNFINGERPRINTABLE',
      draft: null,
    };
    const bound: ValidationSubject = {
      kind: 'UNFINGERPRINTABLE',
      draft: { ruleSetId: 'draft', draftRevision: createDraftRevision(1) },
    };
    const fingerprinted: ValidationSubject = {
      kind: 'FINGERPRINTED',
      draft: bound.draft!,
      reviewedSnapshotFingerprint:
        'test-evidence' as ReviewedSnapshotFingerprint,
    };
    const invalid: ValidationSubject = {
      kind: 'UNFINGERPRINTABLE',
      draft: null,
      // @ts-expect-error Unfingerprintable content cannot carry a fingerprint.
      reviewedSnapshotFingerprint: fingerprinted.reviewedSnapshotFingerprint,
    };
    expect(unbound.draft).toBeNull();
    expect(bound.draft?.ruleSetId).toBe('draft');
    expect(fingerprinted.kind).toBe('FINGERPRINTED');
    expect(invalid.kind).toBe('UNFINGERPRINTABLE');
  });
  it('requires nonempty unpinned evidence, excludes pinned expectations and narrows issue codes', () => {
    expect(contractAssertions).toEqual([false, false, false, false]);
    const pinned: RuleSelectionEvidence = { kind: 'PINNED' };
    expect(pinned).toEqual({ kind: 'PINNED' });
  });
  it('allows a full period to bind several adjacent applicability entries for the same snapshot', () => {
    const first: ExpectedApplicability = {
      applicabilityId: 'first' as ApplicabilityId,
      expectedRevision: createApplicabilityRevision(1),
      expectedState: {
        jurisdictionCode: 'TEST',
        ruleSetId: 'snapshot',
        applicableFrom: parseBusinessDate('2024-01-01'),
        applicableTo: parseBusinessDate('2024-01-16'),
        scheduled: true,
      },
    };
    const second: ExpectedApplicability = {
      applicabilityId: 'second' as ApplicabilityId,
      expectedRevision: createApplicabilityRevision(2),
      expectedState: {
        ...first.expectedState,
        applicableFrom: parseBusinessDate('2024-01-16'),
        applicableTo: parseBusinessDate('2024-02-01'),
      },
    };
    const evidence: RuleSelectionEvidence = {
      kind: 'UNPINNED',
      requiredCoverage: {
        kind: 'PERIOD',
        startDate: parseBusinessDate('2024-01-01'),
        endDateInclusive: parseBusinessDate('2024-01-31'),
      },
      expectedApplicability: [first, second],
    };
    expect(evidence.expectedApplicability).toHaveLength(2);
    expect(first.expectedState.ruleSetId).toBe(second.expectedState.ruleSetId);
  });
  it('also represents single-date required coverage', () => {
    const coverage: Unpinned['requiredCoverage'] = {
      kind: 'DATE',
      date: parseBusinessDate('9999-12-31'),
    };
    expect(coverage.kind).toBe('DATE');
  });
});
