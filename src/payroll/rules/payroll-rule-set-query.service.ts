import { Injectable } from '@nestjs/common';
import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface PayrollRuleSetQueryInput {
  jurisdictionCode?: string;
  status?: PayrollRuleSetStatus;
  page?: number;
  limit?: number;
}

const PAYROLL_RULE_SET_METADATA_SELECT = {
  id: true,
  jurisdictionCode: true,
  version: true,
  schemaVersion: true,
  status: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type PayrollRuleSetMetadataRow = Prisma.PayrollRuleSetGetPayload<{
  select: typeof PAYROLL_RULE_SET_METADATA_SELECT;
}>;

export type PayrollRuleSetMetadata = Omit<
  PayrollRuleSetMetadataRow,
  'effectiveFrom' | 'effectiveTo'
> & {
  effectiveFrom: string;
  effectiveTo: string | null;
};

export interface PayrollRuleSetQueryResult {
  data: PayrollRuleSetMetadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

@Injectable()
export class PayrollRuleSetQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findDraftDetail(ruleSetId: string) {
    const row = await this.prisma.payrollRuleSet.findUnique({
      where: { id: ruleSetId },
      select: {
        id: true,
        jurisdictionCode: true,
        version: true,
        schemaVersion: true,
        draftRevision: true,
        rulesPayload: true,
        effectiveFrom: true,
        effectiveTo: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw new PayrollRuleSetDraftQueryError('RULE_SET_NOT_FOUND');
    if (row.status !== PayrollRuleSetStatus.DRAFT)
      throw new PayrollRuleSetDraftQueryError('RULE_SET_NOT_DRAFT');
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      version: row.version,
      schemaVersion: row.schemaVersion,
      draftRevision: row.draftRevision,
      rulesPayload: row.rulesPayload,
      approvedEffectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      approvedEffectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
      status: 'DRAFT' as const,
      publishedAt: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAll(
    input: PayrollRuleSetQueryInput = {},
  ): Promise<PayrollRuleSetQueryResult> {
    const page = Math.max(input.page ?? 1, 1);
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const where: Prisma.PayrollRuleSetWhereInput = {
      ...(input.jurisdictionCode !== undefined
        ? { jurisdictionCode: input.jurisdictionCode }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payrollRuleSet.findMany({
        where,
        select: PAYROLL_RULE_SET_METADATA_SELECT,
        orderBy: [
          { jurisdictionCode: 'asc' },
          { version: 'desc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payrollRuleSet.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        ...row,
        effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo:
          row.effectiveTo === null
            ? null
            : row.effectiveTo.toISOString().slice(0, 10),
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export class PayrollRuleSetDraftQueryError extends Error {
  constructor(
    public readonly code: 'RULE_SET_NOT_FOUND' | 'RULE_SET_NOT_DRAFT',
  ) {
    super(code);
    this.name = 'PayrollRuleSetDraftQueryError';
  }
}
