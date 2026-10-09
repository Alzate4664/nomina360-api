export type PayrollRuleSetDomainErrorCode =
  | 'INVALID_BUSINESS_DATE'
  | 'INVALID_APPROVED_TEMPORAL_ENVELOPE'
  | 'INVALID_REQUIRED_PERIOD'
  | 'INVALID_REVISION'
  | 'REVISION_OVERFLOW'
  | 'INVALID_CANONICAL_CONTENT';

export class PayrollRuleSetDomainError extends Error {
  constructor(
    public readonly code: PayrollRuleSetDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRuleSetDomainError';
  }
}
