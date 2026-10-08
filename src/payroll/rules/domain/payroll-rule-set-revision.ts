import { PayrollRuleSetDomainError } from './payroll-rule-set.errors';

declare const draftRevisionBrand: unique symbol;
declare const applicabilityRevisionBrand: unique symbol;
export type DraftRevision = number & { readonly [draftRevisionBrand]: true };
export type ApplicabilityRevision = number & {
  readonly [applicabilityRevisionBrand]: true;
};

function validateRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new PayrollRuleSetDomainError(
      'INVALID_REVISION',
      'Revision must be a positive safe integer.',
    );
  }
  return value;
}

export function createDraftRevision(value: unknown): DraftRevision {
  return validateRevision(value) as DraftRevision;
}

export function createApplicabilityRevision(
  value: unknown,
): ApplicabilityRevision {
  return validateRevision(value) as ApplicabilityRevision;
}

function increment(value: number): number {
  validateRevision(value);
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new PayrollRuleSetDomainError(
      'REVISION_OVERFLOW',
      'Revision cannot be incremented safely.',
    );
  }
  return value + 1;
}

/** Future saves increment only for review-relevant persisted changes, never no-op saves.
 * Clients supply expectedRevision only; the server chooses the next revision.
 */
export function incrementDraftRevision(value: DraftRevision): DraftRevision {
  return increment(value) as DraftRevision;
}

export function incrementApplicabilityRevision(
  value: ApplicabilityRevision,
): ApplicabilityRevision {
  return increment(value) as ApplicabilityRevision;
}
