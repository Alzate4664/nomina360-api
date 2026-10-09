import { Injectable } from '@nestjs/common';
import { PayrollRuleSetStatus, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeCanonicalJson } from './domain/payroll-rule-set-fingerprint';
import { createApprovedTemporalEnvelope } from './domain/payroll-rule-set-temporal';
import { parsePayrollRulesSnapshot } from './payroll-rules-codec';

export interface CreatePayrollRuleSetDraftInput {
  readonly jurisdictionCode: string;
  readonly schemaVersion: number;
  readonly rulesPayload: unknown;
  readonly approvedEffectiveFrom: string;
  readonly approvedEffectiveTo: string | null;
}

export type PayrollRuleSetDraftCreationErrorCode =
  | 'INVALID_ACTOR_USER_ID'
  | 'PLATFORM_ACTOR_UNAUTHORIZED'
  | 'INVALID_CREATE_INPUT'
  | 'INVALID_JURISDICTION'
  | 'VERSION_EXHAUSTED'
  | 'VERSION_ALLOCATION_CONFLICT';

export class PayrollRuleSetDraftCreationError extends Error {
  constructor(
    public readonly code: PayrollRuleSetDraftCreationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PayrollRuleSetDraftCreationError';
  }
}

const METADATA_SELECT = {
  id: true,
  jurisdictionCode: true,
  version: true,
  schemaVersion: true,
  draftRevision: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type StoredMetadata = Prisma.PayrollRuleSetGetPayload<{
  select: typeof METADATA_SELECT;
}>;
export interface CreatedPayrollRuleSetDraft extends Omit<
  StoredMetadata,
  'effectiveFrom' | 'effectiveTo'
> {
  readonly approvedEffectiveFrom: string;
  readonly approvedEffectiveTo: string | null;
}

@Injectable()
export class PayrollRuleSetDraftCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createDraft(
    input: CreatePayrollRuleSetDraftInput,
    actorUserId: string,
  ): Promise<CreatedPayrollRuleSetDraft> {
    if (typeof actorUserId !== 'string' || actorUserId.trim().length === 0) {
      throw new PayrollRuleSetDraftCreationError(
        'INVALID_ACTOR_USER_ID',
        'An actor user id is required.',
      );
    }
    this.requireDataInput(input);
    const { jurisdictionCode, schemaVersion } = input;
    if (
      typeof jurisdictionCode !== 'string' ||
      !/^[A-Z]{2}$/.test(jurisdictionCode)
    ) {
      throw new PayrollRuleSetDraftCreationError(
        'INVALID_JURISDICTION',
        'Expected a canonical jurisdiction code.',
      );
    }
    const envelope = createApprovedTemporalEnvelope(
      input.approvedEffectiveFrom,
      input.approvedEffectiveTo,
    );
    const detachedPayload: unknown = JSON.parse(
      serializeCanonicalJson(input.rulesPayload),
    );
    parsePayrollRulesSnapshot(schemaVersion, detachedPayload);
    const effectiveFrom = new Date(
      `${envelope.approvedEffectiveFrom}T00:00:00.000Z`,
    );
    const effectiveTo =
      envelope.approvedEffectiveTo === null
        ? null
        : new Date(`${envelope.approvedEffectiveTo}T00:00:00.000Z`);

    return this.prisma.$transaction(
      async (tx) => {
        const actorId = await this.lockAndRequireActor(tx, actorUserId);
        const lockKey = `payroll-rules:${jurisdictionCode}`;
        await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0::bigint)
        )
      `;
        const maximum = await tx.payrollRuleSet.aggregate({
          where: { jurisdictionCode },
          _max: { version: true },
        });
        if (maximum._max.version === 2147483647) {
          throw new PayrollRuleSetDraftCreationError(
            'VERSION_EXHAUSTED',
            'Jurisdiction version space is exhausted.',
          );
        }
        const version = (maximum._max.version ?? 0) + 1;
        let created: StoredMetadata;
        try {
          created = await tx.payrollRuleSet.create({
            data: {
              jurisdictionCode,
              version,
              schemaVersion,
              draftRevision: 1,
              status: PayrollRuleSetStatus.DRAFT,
              effectiveFrom,
              effectiveTo,
              rulesPayload: detachedPayload as Prisma.InputJsonValue,
              publishedAt: null,
            },
            select: METADATA_SELECT,
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002' &&
            Array.isArray(error.meta?.target) &&
            error.meta.target.length === 2 &&
            error.meta.target.includes('jurisdictionCode') &&
            error.meta.target.includes('version')
          ) {
            throw new PayrollRuleSetDraftCreationError(
              'VERSION_ALLOCATION_CONFLICT',
              'Jurisdiction version allocation conflicted.',
            );
          }
          throw error;
        }
        const metadata = {
          id: created.id,
          jurisdictionCode: created.jurisdictionCode,
          version: created.version,
          schemaVersion: created.schemaVersion,
          draftRevision: created.draftRevision,
          approvedEffectiveFrom: created.effectiveFrom
            .toISOString()
            .slice(0, 10),
          approvedEffectiveTo:
            created.effectiveTo?.toISOString().slice(0, 10) ?? null,
          status: created.status,
          publishedAt: created.publishedAt,
        };
        await this.auditService.log(
          {
            userId: actorId,
            action: 'CREATE_PAYROLL_RULE_SET_DRAFT',
            entity: 'PayrollRuleSet',
            entityId: created.id,
            newValue: {
              ...metadata,
              publishedAt: metadata.publishedAt?.toISOString() ?? null,
            },
          },
          tx,
        );
        return {
          ...metadata,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private requireDataInput(
    input: unknown,
  ): asserts input is CreatePayrollRuleSetDraftInput {
    const invalid = () =>
      new PayrollRuleSetDraftCreationError(
        'INVALID_CREATE_INPUT',
        'Expected exactly the draft creation data fields.',
      );
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      throw invalid();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw invalid();
    const keys = [
      'jurisdictionCode',
      'schemaVersion',
      'rulesPayload',
      'approvedEffectiveFrom',
      'approvedEffectiveTo',
    ];
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (
      Reflect.ownKeys(input).length !== keys.length ||
      keys.some(
        (key) =>
          !descriptors[key] ||
          !descriptors[key].enumerable ||
          !('value' in descriptors[key]),
      )
    )
      throw invalid();
  }

  private async lockAndRequireActor(
    tx: Prisma.TransactionClient,
    actorUserId: string,
  ): Promise<string> {
    const actors = await tx.$queryRaw<
      Array<{
        id: string;
        isActive: boolean;
        role: UserRole;
        companyId: string | null;
      }>
    >`
      SELECT "id", "isActive", "role", "companyId"
      FROM "User"
      WHERE "id" = ${actorUserId}
      FOR UPDATE
    `;
    const actor = actors[0];
    if (
      actors.length !== 1 ||
      !actor.isActive ||
      actor.role !== UserRole.SUPER_ADMIN ||
      actor.companyId !== null
    ) {
      throw new PayrollRuleSetDraftCreationError(
        'PLATFORM_ACTOR_UNAUTHORIZED',
        'An authorized platform actor is required.',
      );
    }
    return actor.id;
  }
}
