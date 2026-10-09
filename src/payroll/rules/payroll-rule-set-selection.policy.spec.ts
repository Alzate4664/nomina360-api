import { PayrollType } from '@prisma/client';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';
import type { PayrollCalculationContext } from './payroll-calculation-context';
import {
  PayrollRuleSetSelectionError,
  PayrollRuleSetSelectionPolicy,
} from './payroll-rule-set-selection.policy';
import { PayrollRulesResolver } from './payroll-rules-resolver';

describe('PayrollRuleSetSelectionPolicy', () => {
  let policy: PayrollRuleSetSelectionPolicy;

  const resolver = {
    resolvePublished: jest.fn(),
    resolveById: jest.fn(),
  };

  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2026-01-31T00:00:00.000Z');

  function context(
    ruleSetId: string,
    effectiveBusinessDate: Date,
  ): PayrollCalculationContext {
    return {
      ruleSetId,
      jurisdictionCode: 'CO',
      effectiveBusinessDate,
      rules: DEFAULT_PAYROLL_RULES,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();

    policy = new PayrollRuleSetSelectionPolicy(
      resolver as unknown as PayrollRulesResolver,
    );
  });

  it('selects a rule set when both periodic boundaries resolve to the same version', async () => {
    resolver.resolvePublished
      .mockResolvedValueOnce(context('rules-co-1', startDate))
      .mockResolvedValueOnce(context('rules-co-1', endDate));

    const selection = await policy.selectForPayrollPeriod('CO', {
      payrollType: PayrollType.MONTHLY,
      startDate,
      endDate,
      calculatedRuleSetId: null,
    });

    expect(resolver.resolvePublished).toHaveBeenNthCalledWith(
      1,
      'CO',
      startDate,
    );

    expect(resolver.resolvePublished).toHaveBeenNthCalledWith(2, 'CO', endDate);

    expect(selection.ruleSetId).toBe('rules-co-1');
    expect(selection.jurisdictionCode).toBe('CO');
    expect(selection.rules).toBe(DEFAULT_PAYROLL_RULES);
  });

  it('rejects a periodic payroll that spans multiple rule sets', async () => {
    resolver.resolvePublished
      .mockResolvedValueOnce(context('rules-co-1', startDate))
      .mockResolvedValueOnce(context('rules-co-2', endDate));

    await expect(
      policy.selectForPayrollPeriod('CO', {
        payrollType: PayrollType.SEMIMONTHLY,
        startDate,
        endDate,
        calculatedRuleSetId: null,
      }),
    ).rejects.toMatchObject<Partial<PayrollRuleSetSelectionError>>({
      code: 'PAYROLL_PERIOD_SPANS_MULTIPLE_RULE_SETS',
    });
  });

  it('reuses a pinned rule set for both boundaries during recalculation', async () => {
    resolver.resolveById
      .mockResolvedValueOnce(context('rules-co-1', startDate))
      .mockResolvedValueOnce(context('rules-co-1', endDate));

    const selection = await policy.selectForPayrollPeriod('CO', {
      payrollType: PayrollType.WEEKLY,
      startDate,
      endDate,
      calculatedRuleSetId: 'rules-co-1',
    });

    expect(resolver.resolveById).toHaveBeenNthCalledWith(
      1,
      'rules-co-1',
      'CO',
      startDate,
    );

    expect(resolver.resolveById).toHaveBeenNthCalledWith(
      2,
      'rules-co-1',
      'CO',
      endDate,
    );

    expect(resolver.resolvePublished).not.toHaveBeenCalled();
    expect(selection.ruleSetId).toBe('rules-co-1');
  });

  it.each([
    PayrollType.BONUS,
    PayrollType.SEVERANCE,
    PayrollType.TERMINATION,
    PayrollType.EXTRAORDINARY,
  ])(
    'rejects payroll type %s because its temporal policy is not defined',
    async (payrollType) => {
      await expect(
        policy.selectForPayrollPeriod('CO', {
          payrollType,
          startDate,
          endDate,
          calculatedRuleSetId: null,
        }),
      ).rejects.toMatchObject<Partial<PayrollRuleSetSelectionError>>({
        code: 'PAYROLL_TYPE_TEMPORAL_POLICY_UNDEFINED',
      });

      expect(resolver.resolvePublished).not.toHaveBeenCalled();
      expect(resolver.resolveById).not.toHaveBeenCalled();
    },
  );

  it('rejects periodic payroll without both business dates', async () => {
    await expect(
      policy.selectForPayrollPeriod('CO', {
        payrollType: PayrollType.BIWEEKLY,
        startDate,
        endDate: null,
        calculatedRuleSetId: null,
      }),
    ).rejects.toMatchObject<Partial<PayrollRuleSetSelectionError>>({
      code: 'PAYROLL_PERIOD_DATES_REQUIRED',
    });

    expect(resolver.resolvePublished).not.toHaveBeenCalled();
  });

  it('rejects an inverted periodic payroll date range', async () => {
    await expect(
      policy.selectForPayrollPeriod('CO', {
        payrollType: PayrollType.MONTHLY,
        startDate: endDate,
        endDate: startDate,
        calculatedRuleSetId: null,
      }),
    ).rejects.toMatchObject<Partial<PayrollRuleSetSelectionError>>({
      code: 'PAYROLL_PERIOD_DATE_RANGE_INVALID',
    });

    expect(resolver.resolvePublished).not.toHaveBeenCalled();
  });

  it('resolves employment termination using terminationDate', async () => {
    const terminationDate = new Date('2026-09-08T00:00:00.000Z');

    resolver.resolvePublished.mockResolvedValue(
      context('rules-co-1', terminationDate),
    );

    const selection = await policy.selectForEmploymentTermination('CO', {
      terminationDate,
      calculatedRuleSetId: null,
    });

    expect(resolver.resolvePublished).toHaveBeenCalledWith(
      'CO',
      terminationDate,
    );

    expect(resolver.resolveById).not.toHaveBeenCalled();
    expect(selection.ruleSetId).toBe('rules-co-1');
  });

  it('reuses the pinned rule set when recalculating an employment termination', async () => {
    const terminationDate = new Date('2026-09-08T00:00:00.000Z');

    resolver.resolveById.mockResolvedValue(
      context('rules-co-1', terminationDate),
    );

    const selection = await policy.selectForEmploymentTermination('CO', {
      terminationDate,
      calculatedRuleSetId: 'rules-co-1',
    });

    expect(resolver.resolveById).toHaveBeenCalledWith(
      'rules-co-1',
      'CO',
      terminationDate,
    );

    expect(resolver.resolvePublished).not.toHaveBeenCalled();
    expect(selection.ruleSetId).toBe('rules-co-1');
  });
});
