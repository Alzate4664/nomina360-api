import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { DEFAULT_PAYROLL_RULES } from '../../src/payroll/rules/default-payroll-rules';
import { serializePayrollRulesSnapshot } from '../../src/payroll/rules/payroll-rules-codec';

const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

export const E2E_CO_PAYROLL_RULE_SET_ID = 'e2e-co-payroll-rules-2099-v1';

export const E2E_CO_PAYROLL_RULE_SET_VERSION = 999001;

export const E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_FROM = new Date(
  '2099-01-01T00:00:00.000Z',
);

export const E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_TO = new Date(
  '2100-01-01T00:00:00.000Z',
);

export const E2E_CO_PAYROLL_RULE_SET_PUBLISHED_AT = new Date(
  '2098-12-01T00:00:00.000Z',
);

export const E2E_CO_PAYROLL_RULE_SET_SCHEMA_VERSION = snapshot.schemaVersion;

export const E2E_CO_PAYROLL_RULE_SET_PAYLOAD = snapshot.rulesPayload;

export const E2E_CO_PAYROLL_RULE_SET_DATA = {
  id: E2E_CO_PAYROLL_RULE_SET_ID,
  jurisdictionCode: 'CO',
  version: E2E_CO_PAYROLL_RULE_SET_VERSION,
  schemaVersion: E2E_CO_PAYROLL_RULE_SET_SCHEMA_VERSION,
  status: PayrollRuleSetStatus.PUBLISHED,
  effectiveFrom: E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_FROM,
  effectiveTo: E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_TO,
  rulesPayload:
    E2E_CO_PAYROLL_RULE_SET_PAYLOAD as unknown as Prisma.InputJsonValue,
  publishedAt: E2E_CO_PAYROLL_RULE_SET_PUBLISHED_AT,
} satisfies Prisma.PayrollRuleSetCreateInput;
