import { Injectable } from '@nestjs/common';
import { PayrollType } from '@prisma/client';
import type { PayrollRules } from './payroll-rules';
import type { PayrollCalculationContext } from './payroll-calculation-context';
import { PayrollRulesResolver } from './payroll-rules-resolver';

export type PayrollRuleSetSelectionErrorCode =
  | 'PAYROLL_TYPE_TEMPORAL_POLICY_UNDEFINED'
  | 'PAYROLL_PERIOD_DATES_REQUIRED'
  | 'PAYROLL_PERIOD_DATE_RANGE_INVALID'
  | 'PAYROLL_PERIOD_SPANS_MULTIPLE_RULE_SETS';

export class PayrollRuleSetSelectionError extends Error {
  constructor(
    public readonly code: PayrollRuleSetSelectionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRuleSetSelectionError';
  }
}

export interface PayrollPeriodRuleSelectionInput {
  readonly payrollType: PayrollType;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly calculatedRuleSetId: string | null;
}

export interface EmploymentTerminationRuleSelectionInput {
  readonly terminationDate: Date;
  readonly calculatedRuleSetId: string | null;
}

export interface SelectedPayrollRuleSet {
  readonly ruleSetId: string;
  readonly jurisdictionCode: string;
  readonly rules: PayrollRules;
}

const PERIODIC_PAYROLL_TYPES = new Set<PayrollType>([
  PayrollType.MONTHLY,
  PayrollType.SEMIMONTHLY,
  PayrollType.WEEKLY,
  PayrollType.BIWEEKLY,
]);

@Injectable()
export class PayrollRuleSetSelectionPolicy {
  constructor(private readonly resolver: PayrollRulesResolver) {}

  async selectForPayrollPeriod(
    jurisdictionCode: string,
    period: PayrollPeriodRuleSelectionInput,
  ): Promise<SelectedPayrollRuleSet> {
    if (!PERIODIC_PAYROLL_TYPES.has(period.payrollType)) {
      throw new PayrollRuleSetSelectionError(
        'PAYROLL_TYPE_TEMPORAL_POLICY_UNDEFINED',
        `Payroll type ${period.payrollType} does not yet have a payroll rule set temporal policy`,
      );
    }

    if (!period.startDate || !period.endDate) {
      throw new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_DATES_REQUIRED',
        `Payroll type ${period.payrollType} requires startDate and endDate to select payroll rules`,
      );
    }

    if (period.startDate > period.endDate) {
      throw new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_DATE_RANGE_INVALID',
        'Payroll period startDate cannot be after endDate',
      );
    }

    if (period.calculatedRuleSetId) {
      const startContext = await this.resolver.resolveById(
        period.calculatedRuleSetId,
        jurisdictionCode,
        period.startDate,
      );

      await this.resolver.resolveById(
        period.calculatedRuleSetId,
        jurisdictionCode,
        period.endDate,
      );

      return this.toSelection(startContext);
    }

    const startContext = await this.resolver.resolvePublished(
      jurisdictionCode,
      period.startDate,
    );

    const endContext = await this.resolver.resolvePublished(
      jurisdictionCode,
      period.endDate,
    );

    if (startContext.ruleSetId !== endContext.ruleSetId) {
      throw new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_SPANS_MULTIPLE_RULE_SETS',
        `Payroll period spans multiple payroll rule sets: ${startContext.ruleSetId} and ${endContext.ruleSetId}`,
      );
    }

    return this.toSelection(startContext);
  }

  async selectForEmploymentTermination(
    jurisdictionCode: string,
    termination: EmploymentTerminationRuleSelectionInput,
  ): Promise<SelectedPayrollRuleSet> {
    const context = termination.calculatedRuleSetId
      ? await this.resolver.resolveById(
          termination.calculatedRuleSetId,
          jurisdictionCode,
          termination.terminationDate,
        )
      : await this.resolver.resolvePublished(
          jurisdictionCode,
          termination.terminationDate,
        );

    return this.toSelection(context);
  }

  private toSelection(
    context: PayrollCalculationContext,
  ): SelectedPayrollRuleSet {
    return {
      ruleSetId: context.ruleSetId,
      jurisdictionCode: context.jurisdictionCode,
      rules: context.rules,
    };
  }
}
