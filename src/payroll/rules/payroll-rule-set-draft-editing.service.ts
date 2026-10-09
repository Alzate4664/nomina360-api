import { Injectable } from '@nestjs/common';
import { PayrollRuleSetStatus, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollRuleSetDomainError } from './domain/payroll-rule-set.errors';
import { serializeCanonicalJson } from './domain/payroll-rule-set-fingerprint';
import {
  createDraftRevision,
  DraftRevision,
  incrementDraftRevision,
} from './domain/payroll-rule-set-revision';
import { createApprovedTemporalEnvelope } from './domain/payroll-rule-set-temporal';
import { parsePayrollRulesSnapshot } from './payroll-rules-codec';

export interface EditPayrollRuleSetDraftInput {
  readonly ruleSetId: string;
  readonly expectedDraftRevision: number;
  readonly schemaVersion: number;
  readonly rulesPayload: unknown;
  readonly approvedEffectiveFrom: string;
  readonly approvedEffectiveTo: string | null;
}

export type PayrollRuleSetDraftEditingErrorCode =
  | 'INVALID_ACTOR_USER_ID'
  | 'INVALID_EDIT_INPUT'
  | 'INVALID_RULE_SET_ID'
  | 'INVALID_EXPECTED_DRAFT_REVISION'
  | 'PLATFORM_ACTOR_UNAUTHORIZED'
  | 'RULE_SET_NOT_FOUND'
  | 'RULE_SET_NOT_DRAFT'
  | 'STALE_DRAFT_REVISION'
  | 'DRAFT_REVISION_EXHAUSTED'
  | 'DRAFT_EDIT_INVARIANT_VIOLATION';

export class PayrollRuleSetDraftEditingError extends Error {
  constructor(public readonly code: PayrollRuleSetDraftEditingErrorCode) {
    super(code);
    this.name = 'PayrollRuleSetDraftEditingError';
  }
}

const MAX_REVISION = 2147483647;
const METADATA_SELECT = {
  id: true,
  jurisdictionCode: true,
  version: true,
  schemaVersion: true,
  draftRevision: true,
  effectiveFrom: true,
  effectiveTo: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
type StoredMetadata = Prisma.PayrollRuleSetGetPayload<{
  select: typeof METADATA_SELECT;
}>;
export interface EditedPayrollRuleSetDraft extends Omit<
  StoredMetadata,
  'effectiveFrom' | 'effectiveTo'
> {
  readonly approvedEffectiveFrom: string;
  readonly approvedEffectiveTo: string | null;
}

function metadata(row: StoredMetadata): EditedPayrollRuleSetDraft {
  return {
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    version: row.version,
    schemaVersion: row.schemaVersion,
    draftRevision: row.draftRevision,
    approvedEffectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    approvedEffectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    status: row.status,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function auditMetadata(row: EditedPayrollRuleSetDraft) {
  return {
    id: row.id,
    jurisdictionCode: row.jurisdictionCode,
    version: row.version,
    schemaVersion: row.schemaVersion,
    draftRevision: row.draftRevision,
    approvedEffectiveFrom: row.approvedEffectiveFrom,
    approvedEffectiveTo: row.approvedEffectiveTo,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class PayrollRuleSetDraftEditingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async editDraft(
    input: EditPayrollRuleSetDraftInput,
    actorUserId: string,
  ): Promise<EditedPayrollRuleSetDraft> {
    if (typeof actorUserId !== 'string' || !actorUserId.trim())
      throw new PayrollRuleSetDraftEditingError('INVALID_ACTOR_USER_ID');
    this.requireDataInput(input);
    const { ruleSetId, schemaVersion } = input;
    if (typeof ruleSetId !== 'string' || !ruleSetId.trim())
      throw new PayrollRuleSetDraftEditingError('INVALID_RULE_SET_ID');
    let expectedDraftRevision: DraftRevision;
    try {
      expectedDraftRevision = createDraftRevision(input.expectedDraftRevision);
    } catch (error) {
      if (
        error instanceof PayrollRuleSetDomainError &&
        error.code === 'INVALID_REVISION'
      )
        throw new PayrollRuleSetDraftEditingError(
          'INVALID_EXPECTED_DRAFT_REVISION',
        );
      throw error;
    }
    if (expectedDraftRevision > MAX_REVISION)
      throw new PayrollRuleSetDraftEditingError(
        'INVALID_EXPECTED_DRAFT_REVISION',
      );
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
        const actors = await tx.$queryRaw<
          Array<{
            id: string;
            isActive: boolean;
            role: UserRole;
            companyId: string | null;
          }>
        >`
        SELECT "id", "isActive", "role", "companyId"
        FROM "User" WHERE "id" = ${actorUserId} FOR UPDATE
      `;
        const actor = actors[0];
        if (
          actors.length !== 1 ||
          actor.isActive !== true ||
          actor.role !== UserRole.SUPER_ADMIN ||
          actor.companyId !== null
        )
          throw new PayrollRuleSetDraftEditingError(
            'PLATFORM_ACTOR_UNAUTHORIZED',
          );
        const targets = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "PayrollRuleSet" WHERE "id" = ${ruleSetId} FOR UPDATE
      `;
        if (targets.length === 0)
          throw new PayrollRuleSetDraftEditingError('RULE_SET_NOT_FOUND');
        if (targets.length !== 1 || targets[0].id !== ruleSetId)
          throw new PayrollRuleSetDraftEditingError(
            'DRAFT_EDIT_INVARIANT_VIOLATION',
          );
        const current = await tx.payrollRuleSet.findUnique({
          where: { id: ruleSetId },
          select: { ...METADATA_SELECT, rulesPayload: true },
        });
        if (!current || current.id !== ruleSetId)
          throw new PayrollRuleSetDraftEditingError(
            'DRAFT_EDIT_INVARIANT_VIOLATION',
          );
        if (current.status !== PayrollRuleSetStatus.DRAFT)
          throw new PayrollRuleSetDraftEditingError('RULE_SET_NOT_DRAFT');
        let oldMetadata: EditedPayrollRuleSetDraft;
        try {
          createDraftRevision(current.draftRevision);
          if (
            current.draftRevision > MAX_REVISION ||
            current.publishedAt !== null
          )
            throw new PayrollRuleSetDraftEditingError(
              'DRAFT_EDIT_INVARIANT_VIOLATION',
            );
          oldMetadata = metadata(current);
          createApprovedTemporalEnvelope(
            oldMetadata.approvedEffectiveFrom,
            oldMetadata.approvedEffectiveTo,
          );
          if (
            current.effectiveFrom.toISOString() !==
              `${oldMetadata.approvedEffectiveFrom}T00:00:00.000Z` ||
            (current.effectiveTo !== null &&
              current.effectiveTo.toISOString() !==
                `${oldMetadata.approvedEffectiveTo}T00:00:00.000Z`)
          )
            throw new PayrollRuleSetDraftEditingError(
              'DRAFT_EDIT_INVARIANT_VIOLATION',
            );
        } catch {
          throw new PayrollRuleSetDraftEditingError(
            'DRAFT_EDIT_INVARIANT_VIOLATION',
          );
        }
        if (current.draftRevision !== expectedDraftRevision)
          throw new PayrollRuleSetDraftEditingError('STALE_DRAFT_REVISION');
        const content = (
          version: number,
          payload: unknown,
          approvedTemporalEnvelope: {
            approvedEffectiveFrom: string;
            approvedEffectiveTo: string | null;
          },
        ) =>
          serializeCanonicalJson({
            jurisdictionCode: current.jurisdictionCode,
            version: current.version,
            schemaVersion: version,
            rulesPayload: payload,
            approvedTemporalEnvelope,
          });
        let currentContent: string;
        try {
          currentContent = content(
            current.schemaVersion,
            current.rulesPayload,
            {
              approvedEffectiveFrom: oldMetadata.approvedEffectiveFrom,
              approvedEffectiveTo: oldMetadata.approvedEffectiveTo,
            },
          );
        } catch (error) {
          if (error instanceof PayrollRuleSetDomainError)
            throw new PayrollRuleSetDraftEditingError(
              'DRAFT_EDIT_INVARIANT_VIOLATION',
            );
          throw error;
        }
        if (
          currentContent === content(schemaVersion, detachedPayload, envelope)
        )
          return oldMetadata;
        if (current.draftRevision === MAX_REVISION)
          throw new PayrollRuleSetDraftEditingError('DRAFT_REVISION_EXHAUSTED');
        const updated = await tx.payrollRuleSet.updateMany({
          where: {
            id: current.id,
            status: PayrollRuleSetStatus.DRAFT,
            draftRevision: expectedDraftRevision,
          },
          data: {
            schemaVersion,
            rulesPayload: detachedPayload as Prisma.InputJsonValue,
            effectiveFrom,
            effectiveTo,
            draftRevision: incrementDraftRevision(expectedDraftRevision),
          },
        });
        if (updated.count !== 1)
          throw new PayrollRuleSetDraftEditingError(
            'DRAFT_EDIT_INVARIANT_VIOLATION',
          );
        const saved = await tx.payrollRuleSet.findUnique({
          where: { id: current.id },
          select: METADATA_SELECT,
        });
        if (!saved)
          throw new PayrollRuleSetDraftEditingError(
            'DRAFT_EDIT_INVARIANT_VIOLATION',
          );
        const result = metadata(saved);
        // Fingerprint evidence is deferred to the later review-evidence slice; this interim audit does not satisfy final ADR fingerprint requirements.
        await this.auditService.log(
          {
            userId: actor.id,
            action: 'EDIT_PAYROLL_RULE_SET_DRAFT',
            entity: 'PayrollRuleSet',
            entityId: current.id,
            oldValue: auditMetadata(oldMetadata),
            newValue: auditMetadata(result),
          },
          tx,
        );
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  private requireDataInput(
    input: unknown,
  ): asserts input is EditPayrollRuleSetDraftInput {
    const invalid = () =>
      new PayrollRuleSetDraftEditingError('INVALID_EDIT_INPUT');
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      throw invalid();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw invalid();
    const keys = [
      'ruleSetId',
      'expectedDraftRevision',
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
}
