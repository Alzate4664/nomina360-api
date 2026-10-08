import type { ApplicabilityRevision } from './payroll-rule-set-revision';
import type { BusinessDate } from './payroll-rule-set-temporal';

declare const applicabilityIdBrand: unique symbol;
export type ApplicabilityId = string & {
  readonly [applicabilityIdBrand]: true;
};
export interface ApplicabilityState {
  readonly jurisdictionCode: string;
  readonly ruleSetId: string;
  readonly applicableFrom: BusinessDate;
  readonly applicableTo: BusinessDate | null;
  /** Operational calendar membership, independent of today's date or publication. */
  readonly scheduled: boolean;
}
export interface ExpectedApplicability {
  readonly applicabilityId: ApplicabilityId;
  readonly expectedRevision: ApplicabilityRevision;
  readonly expectedState: ApplicabilityState;
}
export type RequiredRuleCoverage =
  | { readonly kind: 'DATE'; readonly date: BusinessDate }
  | {
      readonly kind: 'PERIOD';
      readonly startDate: BusinessDate;
      readonly endDateInclusive: BusinessDate;
    };
/** Multiple adjacent entries may reference one snapshot. Future commit verification
 * must prove continuous full coverage; matching endpoints alone is insufficient.
 */
export type RuleSelectionEvidence =
  | {
      readonly kind: 'PINNED';
      readonly expectedApplicability?: never;
      readonly requiredCoverage?: never;
    }
  | {
      readonly kind: 'UNPINNED';
      readonly requiredCoverage: RequiredRuleCoverage;
      readonly expectedApplicability: readonly [
        ExpectedApplicability,
        ...ExpectedApplicability[],
      ];
    };
