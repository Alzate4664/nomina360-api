import { Injectable } from '@nestjs/common';
import { PayrollRuleSetStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PayrollCalculationContext } from './payroll-calculation-context';
import {
  parsePayrollRulesSnapshot,
  PayrollRulesPayloadValidationError,
} from './payroll-rules-codec';

export type PayrollRulesResolutionErrorCode =
  | 'INVALID_JURISDICTION_CODE'
  | 'INVALID_EFFECTIVE_BUSINESS_DATE'
  | 'RULE_SET_NOT_FOUND'
  | 'RULE_SET_AMBIGUOUS'
  | 'RULE_SET_ID_NOT_FOUND'
  | 'RULE_SET_JURISDICTION_MISMATCH'
  | 'RULE_SET_NOT_PUBLISHED'
  | 'RULE_SET_OUTSIDE_EFFECTIVE_RANGE'
  | 'RULE_SET_PUBLICATION_METADATA_INVALID'
  | 'RULE_SET_PAYLOAD_INVALID';

export class PayrollRulesResolutionError extends Error {
  constructor(
    public readonly code: PayrollRulesResolutionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRulesResolutionError';
  }
}

interface PersistedPayrollRuleSet {
  readonly id: string;
  readonly jurisdictionCode: string;
  readonly schemaVersion: number;
  readonly status: PayrollRuleSetStatus;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly rulesPayload: unknown;
  readonly publishedAt: Date | null;
}

const PAYROLL_RULE_SET_SELECT = {
  id: true,
  jurisdictionCode: true,
  schemaVersion: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  rulesPayload: true,
  publishedAt: true,
} as const;

@Injectable()
export class PayrollRulesResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePublished(
    jurisdictionCode: string,
    effectiveBusinessDate: Date,
  ): Promise<PayrollCalculationContext> {
    const validatedJurisdictionCode =
      this.requireJurisdictionCode(jurisdictionCode);

    const businessDate = this.requireUtcDateOnly(effectiveBusinessDate);

    const candidates = await this.prisma.payrollRuleSet.findMany({
      where: {
        jurisdictionCode: validatedJurisdictionCode,
        status: PayrollRuleSetStatus.PUBLISHED,
        effectiveFrom: {
          lte: businessDate,
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gt: businessDate,
            },
          },
        ],
      },
      select: PAYROLL_RULE_SET_SELECT,
      take: 2,
    });

    if (candidates.length === 0) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_NOT_FOUND',
        `No published payroll rule set applies to ${validatedJurisdictionCode} on ${this.formatDateOnly(businessDate)}`,
      );
    }

    if (candidates.length > 1) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_AMBIGUOUS',
        `Multiple published payroll rule sets apply to ${validatedJurisdictionCode} on ${this.formatDateOnly(businessDate)}`,
      );
    }

    return this.buildContext(
      candidates[0],
      validatedJurisdictionCode,
      businessDate,
    );
  }

  async resolveById(
    ruleSetId: string,
    expectedJurisdictionCode: string,
    effectiveBusinessDate: Date,
  ): Promise<PayrollCalculationContext> {
    const jurisdictionCode = this.requireJurisdictionCode(
      expectedJurisdictionCode,
    );

    const businessDate = this.requireUtcDateOnly(effectiveBusinessDate);

    const ruleSet = await this.prisma.payrollRuleSet.findUnique({
      where: {
        id: ruleSetId,
      },
      select: PAYROLL_RULE_SET_SELECT,
    });

    if (!ruleSet) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_ID_NOT_FOUND',
        `Payroll rule set ${ruleSetId} was not found`,
      );
    }

    if (ruleSet.jurisdictionCode !== jurisdictionCode) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_JURISDICTION_MISMATCH',
        `Payroll rule set ${ruleSetId} belongs to jurisdiction ${ruleSet.jurisdictionCode}, not ${jurisdictionCode}`,
      );
    }

    return this.buildContext(ruleSet, jurisdictionCode, businessDate);
  }

  private buildContext(
    ruleSet: PersistedPayrollRuleSet,
    jurisdictionCode: string,
    effectiveBusinessDate: Date,
  ): PayrollCalculationContext {
    if (ruleSet.status !== PayrollRuleSetStatus.PUBLISHED) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_NOT_PUBLISHED',
        `Payroll rule set ${ruleSet.id} is not published`,
      );
    }

    if (ruleSet.publishedAt === null) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_PUBLICATION_METADATA_INVALID',
        `Published payroll rule set ${ruleSet.id} has no publication timestamp`,
      );
    }

    if (
      ruleSet.effectiveFrom.getTime() > effectiveBusinessDate.getTime() ||
      (ruleSet.effectiveTo !== null &&
        ruleSet.effectiveTo.getTime() <= effectiveBusinessDate.getTime())
    ) {
      throw new PayrollRulesResolutionError(
        'RULE_SET_OUTSIDE_EFFECTIVE_RANGE',
        `Payroll rule set ${ruleSet.id} does not cover ${this.formatDateOnly(effectiveBusinessDate)}`,
      );
    }

    try {
      const rules = parsePayrollRulesSnapshot(
        ruleSet.schemaVersion,
        ruleSet.rulesPayload,
      );

      return {
        ruleSetId: ruleSet.id,
        jurisdictionCode,
        effectiveBusinessDate: new Date(effectiveBusinessDate.getTime()),
        rules,
      };
    } catch (error) {
      if (error instanceof PayrollRulesPayloadValidationError) {
        throw new PayrollRulesResolutionError(
          'RULE_SET_PAYLOAD_INVALID',
          `Payroll rule set ${ruleSet.id} contains an invalid rules payload: ${error.message}`,
        );
      }

      throw error;
    }
  }

  private requireJurisdictionCode(value: string): string {
    if (!/^[A-Z]{2}$/.test(value)) {
      throw new PayrollRulesResolutionError(
        'INVALID_JURISDICTION_CODE',
        'Jurisdiction code must contain exactly two uppercase ASCII letters',
      );
    }

    return value;
  }

  private requireUtcDateOnly(value: Date): Date {
    if (
      !(value instanceof Date) ||
      Number.isNaN(value.getTime()) ||
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0 ||
      value.getUTCMilliseconds() !== 0
    ) {
      throw new PayrollRulesResolutionError(
        'INVALID_EFFECTIVE_BUSINESS_DATE',
        'Effective business date must be a valid UTC date-only value',
      );
    }

    return new Date(value.getTime());
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
