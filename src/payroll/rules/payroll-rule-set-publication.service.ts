import { Injectable } from '@nestjs/common';
import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parsePayrollRulesSnapshot,
  PayrollRulesPayloadValidationError,
} from './payroll-rules-codec';

export type PayrollRuleSetPublicationErrorCode =
  | 'INVALID_ACTOR_USER_ID'
  | 'RULE_SET_NOT_FOUND'
  | 'RULE_SET_NOT_DRAFT'
  | 'RULE_SET_JURISDICTION_INVALID'
  | 'RULE_SET_PUBLICATION_METADATA_INVALID'
  | 'RULE_SET_PAYLOAD_INVALID'
  | 'RULE_SET_OVERLAP'
  | 'RULE_SET_CHANGED_CONCURRENTLY';

export class PayrollRuleSetPublicationError extends Error {
  constructor(
    public readonly code: PayrollRuleSetPublicationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRuleSetPublicationError';
  }
}

const PAYROLL_RULE_SET_PUBLICATION_SELECT = {
  id: true,
  jurisdictionCode: true,
  version: true,
  schemaVersion: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  rulesPayload: true,
  publishedAt: true,
} as const;

type PublicationRuleSet = Prisma.PayrollRuleSetGetPayload<{
  select: typeof PAYROLL_RULE_SET_PUBLICATION_SELECT;
}>;

export interface PublishedPayrollRuleSetResult {
  readonly ruleSetId: string;
  readonly publishedAt: Date;
}

@Injectable()
export class PayrollRuleSetPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async publish(
    ruleSetId: string,
    actorUserId: string,
  ): Promise<PublishedPayrollRuleSetResult> {
    this.requireActorUserId(actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const initialRuleSet = await tx.payrollRuleSet.findUnique({
        where: {
          id: ruleSetId,
        },
        select: {
          id: true,
          jurisdictionCode: true,
          status: true,
        },
      });

      if (!initialRuleSet) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_NOT_FOUND',
          `Payroll rule set ${ruleSetId} was not found`,
        );
      }

      if (initialRuleSet.status !== PayrollRuleSetStatus.DRAFT) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_NOT_DRAFT',
          `Payroll rule set ${ruleSetId} is not a draft`,
        );
      }

      const jurisdictionCode = this.requireJurisdictionCode(
        initialRuleSet.jurisdictionCode,
      );

      const lockKey = `payroll-rules:${jurisdictionCode}`;

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0::bigint)
        )
      `;

      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "PayrollRuleSet"
        WHERE "id" = ${ruleSetId}
        FOR UPDATE
      `;

      if (lockedRows.length !== 1) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_CHANGED_CONCURRENTLY',
          `Payroll rule set ${ruleSetId} changed while publication was starting`,
        );
      }

      const ruleSet = await tx.payrollRuleSet.findUnique({
        where: {
          id: ruleSetId,
        },
        select: PAYROLL_RULE_SET_PUBLICATION_SELECT,
      });

      if (!ruleSet) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_CHANGED_CONCURRENTLY',
          `Payroll rule set ${ruleSetId} no longer exists`,
        );
      }

      if (ruleSet.jurisdictionCode !== jurisdictionCode) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_CHANGED_CONCURRENTLY',
          `Payroll rule set ${ruleSetId} changed jurisdiction while publication was starting`,
        );
      }

      if (ruleSet.status !== PayrollRuleSetStatus.DRAFT) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_NOT_DRAFT',
          `Payroll rule set ${ruleSetId} is no longer a draft`,
        );
      }

      if (ruleSet.publishedAt !== null) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_PUBLICATION_METADATA_INVALID',
          `Draft payroll rule set ${ruleSetId} already has a publication timestamp`,
        );
      }

      this.validatePayload(ruleSet);

      const overlappingRuleSet = await tx.payrollRuleSet.findFirst({
        where: this.buildOverlapWhere(ruleSet),
        select: {
          id: true,
        },
      });

      if (overlappingRuleSet) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_OVERLAP',
          `Payroll rule set ${ruleSetId} overlaps published rule set ${overlappingRuleSet.id}`,
        );
      }

      const publishedAt = new Date();

      const transition = await tx.payrollRuleSet.updateMany({
        where: {
          id: ruleSet.id,
          jurisdictionCode,
          status: PayrollRuleSetStatus.DRAFT,
        },
        data: {
          status: PayrollRuleSetStatus.PUBLISHED,
          publishedAt,
        },
      });

      if (transition.count !== 1) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_CHANGED_CONCURRENTLY',
          `Payroll rule set ${ruleSetId} changed before it could be published`,
        );
      }

      await this.auditService.log(
        {
          userId: actorUserId,
          action: 'PUBLISH_PAYROLL_RULE_SET',
          entity: 'PayrollRuleSet',
          entityId: ruleSet.id,
          oldValue: {
            jurisdictionCode: ruleSet.jurisdictionCode,
            version: ruleSet.version,
            schemaVersion: ruleSet.schemaVersion,
            status: PayrollRuleSetStatus.DRAFT,
            effectiveFrom: this.formatDateOnly(ruleSet.effectiveFrom),
            effectiveTo: ruleSet.effectiveTo
              ? this.formatDateOnly(ruleSet.effectiveTo)
              : null,
            publishedAt: null,
          },
          newValue: {
            jurisdictionCode: ruleSet.jurisdictionCode,
            version: ruleSet.version,
            schemaVersion: ruleSet.schemaVersion,
            status: PayrollRuleSetStatus.PUBLISHED,
            effectiveFrom: this.formatDateOnly(ruleSet.effectiveFrom),
            effectiveTo: ruleSet.effectiveTo
              ? this.formatDateOnly(ruleSet.effectiveTo)
              : null,
            publishedAt: publishedAt.toISOString(),
          },
        },
        tx,
      );

      return {
        ruleSetId: ruleSet.id,
        publishedAt,
      };
    });
  }

  private validatePayload(ruleSet: PublicationRuleSet): void {
    try {
      parsePayrollRulesSnapshot(ruleSet.schemaVersion, ruleSet.rulesPayload);
    } catch (error) {
      if (error instanceof PayrollRulesPayloadValidationError) {
        throw new PayrollRuleSetPublicationError(
          'RULE_SET_PAYLOAD_INVALID',
          `Payroll rule set ${ruleSet.id} contains an invalid rules payload: ${error.message}`,
        );
      }

      throw error;
    }
  }

  private buildOverlapWhere(
    ruleSet: PublicationRuleSet,
  ): Prisma.PayrollRuleSetWhereInput {
    return {
      jurisdictionCode: ruleSet.jurisdictionCode,
      status: PayrollRuleSetStatus.PUBLISHED,

      ...(ruleSet.effectiveTo !== null
        ? {
            effectiveFrom: {
              lt: ruleSet.effectiveTo,
            },
          }
        : {}),

      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gt: ruleSet.effectiveFrom,
          },
        },
      ],
    };
  }

  private requireActorUserId(value: string): void {
    if (value.trim().length === 0) {
      throw new PayrollRuleSetPublicationError(
        'INVALID_ACTOR_USER_ID',
        'Publishing a payroll rule set requires an actor user id',
      );
    }
  }

  private requireJurisdictionCode(value: string): string {
    if (!/^[A-Z]{2}$/.test(value)) {
      throw new PayrollRuleSetPublicationError(
        'RULE_SET_JURISDICTION_INVALID',
        `Payroll rule set jurisdiction ${value} is invalid`,
      );
    }

    return value;
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
