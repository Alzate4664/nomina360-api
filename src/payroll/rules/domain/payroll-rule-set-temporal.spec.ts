import { PayrollRuleSetDomainError } from './payroll-rule-set.errors';
import {
  createApprovedTemporalEnvelope,
  envelopeContainsDate,
  envelopeCoversInclusivePeriod,
  parseBusinessDate,
} from './payroll-rule-set-temporal';

describe('business dates and approved envelopes', () => {
  it('rejects trailing line breaks', () => {
    expect(() => parseBusinessDate('2024-01-01\n')).toThrow(
      PayrollRuleSetDomainError,
    );
  });
  it.each([
    '0001-01-01',
    '9999-12-31',
    '2024-02-29',
    '2000-02-29',
    '2026-10-08',
  ])('accepts %s unchanged', (value) => {
    expect(parseBusinessDate(value)).toBe(value);
  });
  it.each([
    '0000-01-01',
    '1900-02-29',
    '2023-02-29',
    '2024-04-31',
    '2024-00-01',
    '2024-13-01',
    '2024-01-00',
    '2024-01-32',
    '2024-1-01',
    '10000-01-01',
    '2024-01-01T00:00:00Z',
    ' 2024-01-01',
    '2024-01-01 ',
    '',
    undefined,
    null,
  ])('rejects invalid date %s', (value) => {
    expect(() => parseBusinessDate(value)).toThrow(
      expect.objectContaining({
        code: 'INVALID_BUSINESS_DATE',
      }) as Error,
    );
  });
  it.each(['2024-01-01', '2023-12-31'])(
    'rejects equal or reversed end %s',
    (end) => {
      expect(() => createApprovedTemporalEnvelope('2024-01-01', end)).toThrow(
        expect.objectContaining({
          code: 'INVALID_APPROVED_TEMPORAL_ENVELOPE',
        }) as Error,
      );
    },
  );
  it('requires explicit null for an open end', () => {
    expect(() =>
      createApprovedTemporalEnvelope('2024-01-01', undefined),
    ).toThrow(PayrollRuleSetDomainError);
    expect(
      createApprovedTemporalEnvelope('2024-01-01', null).approvedEffectiveTo,
    ).toBeNull();
  });
  it('includes start and excludes end', () => {
    const envelope = createApprovedTemporalEnvelope('2024-01-01', '2024-02-01');
    expect(
      envelopeContainsDate(envelope, parseBusinessDate('2024-01-01')),
    ).toBe(true);
    expect(
      envelopeContainsDate(envelope, parseBusinessDate('2023-12-31')),
    ).toBe(false);
    expect(
      envelopeContainsDate(envelope, parseBusinessDate('2024-02-01')),
    ).toBe(false);
  });
  it('covers inclusive periods only when both boundaries lie inside', () => {
    const envelope = createApprovedTemporalEnvelope('2024-01-01', '2024-02-01');
    const start = parseBusinessDate('2024-01-01');
    expect(
      envelopeCoversInclusivePeriod(
        envelope,
        start,
        parseBusinessDate('2024-01-31'),
      ),
    ).toBe(true);
    expect(envelopeCoversInclusivePeriod(envelope, start, start)).toBe(true);
    expect(
      envelopeCoversInclusivePeriod(
        envelope,
        start,
        parseBusinessDate('2024-02-01'),
      ),
    ).toBe(false);
    expect(
      envelopeCoversInclusivePeriod(
        envelope,
        parseBusinessDate('2023-12-31'),
        start,
      ),
    ).toBe(false);
    expect(() =>
      envelopeCoversInclusivePeriod(
        envelope,
        start,
        parseBusinessDate('2023-12-31'),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_REQUIRED_PERIOD',
      }) as Error,
    );
  });
  it('covers the maximum date with an open envelope without date arithmetic', () => {
    const envelope = createApprovedTemporalEnvelope('0001-01-01', null);
    expect(
      envelopeCoversInclusivePeriod(
        envelope,
        parseBusinessDate('0001-01-01'),
        parseBusinessDate('9999-12-31'),
      ),
    ).toBe(true);
    expect(
      envelopeContainsDate(
        createApprovedTemporalEnvelope('0001-01-01', '9999-12-31'),
        parseBusinessDate('9999-12-31'),
      ),
    ).toBe(false);
  });
  it('does not mutate source input and returns a frozen envelope', () => {
    const source = Object.freeze({ from: '2024-01-01', to: null });
    const envelope = createApprovedTemporalEnvelope(source.from, source.to);
    envelopeContainsDate(envelope, parseBusinessDate(source.from));
    expect(source).toEqual({ from: '2024-01-01', to: null });
    expect(Object.isFrozen(envelope)).toBe(true);
  });
});
