import { PayrollRuleSetDomainError } from './payroll-rule-set.errors';

declare const businessDateBrand: unique symbol;
export type BusinessDate = string & { readonly [businessDateBrand]: true };

export function parseBusinessDate(value: unknown): BusinessDate {
  if (
    typeof value !== 'string' ||
    value.length !== 10 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new PayrollRuleSetDomainError(
      'INVALID_BUSINESS_DATE',
      'Expected a canonical business date.',
    );
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new PayrollRuleSetDomainError(
      'INVALID_BUSINESS_DATE',
      'Invalid Gregorian business date.',
    );
  }
  return value as BusinessDate;
}

export interface ApprovedTemporalEnvelope {
  readonly approvedEffectiveFrom: BusinessDate;
  readonly approvedEffectiveTo: BusinessDate | null;
}

/** Approval interval is [from, to); only null denotes an open upper bound. */
export function createApprovedTemporalEnvelope(
  from: unknown,
  to: unknown,
): ApprovedTemporalEnvelope {
  const approvedEffectiveFrom = parseBusinessDate(from);
  const approvedEffectiveTo = to === null ? null : parseBusinessDate(to);
  if (
    approvedEffectiveTo !== null &&
    approvedEffectiveTo <= approvedEffectiveFrom
  ) {
    throw new PayrollRuleSetDomainError(
      'INVALID_APPROVED_TEMPORAL_ENVELOPE',
      'End must be strictly after start.',
    );
  }
  return Object.freeze({ approvedEffectiveFrom, approvedEffectiveTo });
}

export function envelopeContainsDate(
  envelope: ApprovedTemporalEnvelope,
  date: BusinessDate,
): boolean {
  return (
    date >= envelope.approvedEffectiveFrom &&
    (envelope.approvedEffectiveTo === null ||
      date < envelope.approvedEffectiveTo)
  );
}

export function envelopeCoversInclusivePeriod(
  envelope: ApprovedTemporalEnvelope,
  startDate: BusinessDate,
  endDateInclusive: BusinessDate,
): boolean {
  if (endDateInclusive < startDate) {
    throw new PayrollRuleSetDomainError(
      'INVALID_REQUIRED_PERIOD',
      'Required period end precedes start.',
    );
  }
  return (
    envelopeContainsDate(envelope, startDate) &&
    envelopeContainsDate(envelope, endDateInclusive)
  );
}
