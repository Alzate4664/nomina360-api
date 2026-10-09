import type { PayrollRules } from './payroll-rules';

export interface PayrollCalculationContext {
  readonly ruleSetId: string;
  readonly jurisdictionCode: string;
  readonly effectiveBusinessDate: Date;
  readonly rules: PayrollRules;
}
