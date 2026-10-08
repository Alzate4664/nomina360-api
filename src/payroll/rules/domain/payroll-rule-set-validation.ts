import type { ReviewedSnapshotFingerprint } from './payroll-rule-set-fingerprint';
import type { DraftRevision } from './payroll-rule-set-revision';

export type ValidationLayer =
  | 'STRUCTURAL'
  | 'DOMAIN'
  | 'TEMPORAL'
  | 'OPERATIONAL_LEGAL_REVIEW';
export interface ValidationIssue<Code extends string = string> {
  readonly code: Code;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}
export type TechnicalValidationStatus = 'PASSED' | 'FAILED' | 'INCOMPLETE';
export type ValidationLayerOutcome<Code extends string = string> =
  | {
      readonly layer: Exclude<ValidationLayer, 'OPERATIONAL_LEGAL_REVIEW'>;
      readonly status: TechnicalValidationStatus;
      readonly issues: readonly ValidationIssue<Code>[];
    }
  | {
      readonly layer: 'OPERATIONAL_LEGAL_REVIEW';
      readonly status: 'NOT_EVALUATED';
      readonly issues: readonly ValidationIssue<Code>[];
    };
export interface DraftRevisionBinding {
  readonly ruleSetId: string;
  readonly draftRevision: DraftRevision;
}
/** Unfingerprintable previews carry no reviewed evidence, including unsaved edits. */
export type ValidationSubject =
  | {
      readonly kind: 'UNFINGERPRINTABLE';
      readonly draft: DraftRevisionBinding | null;
    }
  | {
      readonly kind: 'FINGERPRINTED';
      readonly draft: DraftRevisionBinding;
      readonly reviewedSnapshotFingerprint: ReviewedSnapshotFingerprint;
    };
/** Technical success does not certify Colombian legal correctness. */
export interface ValidationOutcome<Code extends string = string> {
  readonly subject: ValidationSubject;
  readonly technicalStatus: TechnicalValidationStatus;
  readonly layers: readonly ValidationLayerOutcome<Code>[];
}
