import { PayrollRuleSetStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';
import { serializePayrollRulesSnapshot } from './payroll-rules-codec';
import {
  PayrollRulesResolutionError,
  PayrollRulesResolver,
} from './payroll-rules-resolver';

function containing(sample: Record<string, unknown>): unknown {
  return expect.objectContaining(sample);
}

describe('PayrollRulesResolver', () => {
  let resolver: PayrollRulesResolver;

  const prisma = {
    payrollRuleSet: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const effectiveBusinessDate = new Date('2026-07-01T00:00:00.000Z');
  const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

  const publishedRuleSet = {
    id: 'rules-co-1',
    jurisdictionCode: 'CO',
    schemaVersion: snapshot.schemaVersion,
    status: PayrollRuleSetStatus.PUBLISHED,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    rulesPayload: snapshot.rulesPayload,
    publishedAt: new Date('2025-12-15T12:00:00.000Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollRulesResolver,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    resolver = module.get(PayrollRulesResolver);
  });

  it('resolves the single published rule set applicable to the business date', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([publishedRuleSet]);

    const context = await resolver.resolvePublished(
      'CO',
      effectiveBusinessDate,
    );

    expect(prisma.payrollRuleSet.findMany).toHaveBeenCalledWith(
      containing({
        where: {
          jurisdictionCode: 'CO',
          status: PayrollRuleSetStatus.PUBLISHED,
          effectiveFrom: {
            lte: effectiveBusinessDate,
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gt: effectiveBusinessDate,
              },
            },
          ],
        },
        take: 2,
      }),
    );

    expect(context.ruleSetId).toBe(publishedRuleSet.id);
    expect(context.jurisdictionCode).toBe('CO');
    expect(context.effectiveBusinessDate).toEqual(effectiveBusinessDate);
    expect(context.rules.minimumWage.toString()).toBe(
      DEFAULT_PAYROLL_RULES.minimumWage.toString(),
    );
  });

  it('rejects when no published rule set applies', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([]);

    await expect(
      resolver.resolvePublished('CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_NOT_FOUND',
    });
  });

  it('rejects ambiguous overlapping published rule sets', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([
      publishedRuleSet,
      {
        ...publishedRuleSet,
        id: 'rules-co-2',
      },
    ]);

    await expect(
      resolver.resolvePublished('CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_AMBIGUOUS',
    });
  });

  it('resolves a pinned rule set by id without searching for another version', async () => {
    prisma.payrollRuleSet.findUnique.mockResolvedValue(publishedRuleSet);

    const context = await resolver.resolveById(
      publishedRuleSet.id,
      'CO',
      effectiveBusinessDate,
    );

    expect(prisma.payrollRuleSet.findUnique).toHaveBeenCalledWith(
      containing({
        where: {
          id: publishedRuleSet.id,
        },
      }),
    );

    expect(prisma.payrollRuleSet.findMany).not.toHaveBeenCalled();
    expect(context.ruleSetId).toBe(publishedRuleSet.id);
  });

  it('rejects when the pinned rule set id does not exist', async () => {
    prisma.payrollRuleSet.findUnique.mockResolvedValue(null);

    await expect(
      resolver.resolveById('missing-rule-set', 'CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_ID_NOT_FOUND',
    });

    expect(prisma.payrollRuleSet.findMany).not.toHaveBeenCalled();
  });

  it('rejects a pinned rule set from another jurisdiction', async () => {
    prisma.payrollRuleSet.findUnique.mockResolvedValue({
      ...publishedRuleSet,
      jurisdictionCode: 'PE',
    });

    await expect(
      resolver.resolveById(publishedRuleSet.id, 'CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_JURISDICTION_MISMATCH',
    });
  });

  it('rejects a pinned rule set that is not published', async () => {
    prisma.payrollRuleSet.findUnique.mockResolvedValue({
      ...publishedRuleSet,
      status: PayrollRuleSetStatus.DRAFT,
    });

    await expect(
      resolver.resolveById(publishedRuleSet.id, 'CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_NOT_PUBLISHED',
    });
  });

  it('rejects a pinned rule set outside its effective range', async () => {
    prisma.payrollRuleSet.findUnique.mockResolvedValue({
      ...publishedRuleSet,
      effectiveTo: new Date('2026-07-01T00:00:00.000Z'),
    });

    await expect(
      resolver.resolveById(publishedRuleSet.id, 'CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_OUTSIDE_EFFECTIVE_RANGE',
    });
  });

  it('rejects published rule sets without publication metadata', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([
      {
        ...publishedRuleSet,
        publishedAt: null,
      },
    ]);

    await expect(
      resolver.resolvePublished('CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_PUBLICATION_METADATA_INVALID',
    });
  });

  it('rejects invalid persisted rules payloads', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([
      {
        ...publishedRuleSet,
        rulesPayload: {
          ...snapshot.rulesPayload,
          minimumWage: 1750905,
        },
      },
    ]);

    await expect(
      resolver.resolvePublished('CO', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'RULE_SET_PAYLOAD_INVALID',
    });
  });

  it('rejects non date-only effective business dates before querying Prisma', async () => {
    await expect(
      resolver.resolvePublished('CO', new Date('2026-07-01T12:30:00.000Z')),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'INVALID_EFFECTIVE_BUSINESS_DATE',
    });

    expect(prisma.payrollRuleSet.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid jurisdiction codes before querying Prisma', async () => {
    await expect(
      resolver.resolvePublished('co', effectiveBusinessDate),
    ).rejects.toMatchObject<Partial<PayrollRulesResolutionError>>({
      code: 'INVALID_JURISDICTION_CODE',
    });

    expect(prisma.payrollRuleSet.findMany).not.toHaveBeenCalled();
  });
});
