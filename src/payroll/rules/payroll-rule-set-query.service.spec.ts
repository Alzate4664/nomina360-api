import { Test } from '@nestjs/testing';
import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PayrollRuleSetQueryInput,
  PayrollRuleSetQueryService,
} from './payroll-rule-set-query.service';

describe('PayrollRuleSetQueryService', () => {
  let service: PayrollRuleSetQueryService;
  const prisma = {
    payrollRuleSet: {
      findUnique: jest.fn(),
      findMany: jest.fn<
        Promise<unknown[]>,
        [Prisma.PayrollRuleSetFindManyArgs]
      >(),
      count: jest.fn<Promise<number>, [Prisma.PayrollRuleSetCountArgs]>(),
    },
    $transaction: jest.fn<Promise<unknown[]>, [Promise<unknown>[]]>(),
  };

  const row = {
    id: 'rule-set-1',
    jurisdictionCode: 'CO',
    version: 2,
    schemaVersion: 1,
    status: PayrollRuleSetStatus.PUBLISHED,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2026-12-31T00:00:00.000Z'),
    publishedAt: new Date('2025-12-15T15:30:00.000Z'),
    createdAt: new Date('2025-12-01T10:00:00.000Z'),
    updatedAt: new Date('2025-12-15T15:30:00.000Z'),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.payrollRuleSet.findMany.mockResolvedValue([row]);
    prisma.payrollRuleSet.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    const module = await Test.createTestingModule({
      providers: [
        PayrollRuleSetQueryService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PayrollRuleSetQueryService);
  });

  describe('findDraftDetail', () => {
    const payload = { amount: '001.2300', nested: { rate: '0.0400' } };
    const draft = {
      ...row,
      status: PayrollRuleSetStatus.DRAFT,
      schemaVersion: 999,
      draftRevision: 4,
      publishedAt: null,
      rulesPayload: payload,
    };
    it.each([null, new Date('2026-12-31')])(
      'projects dates and unchanged payload with one explicit read: %s',
      async (effectiveTo) => {
        prisma.payrollRuleSet.findUnique.mockResolvedValue({
          ...draft,
          effectiveTo,
          secret: 'excluded',
        });
        const result = await service.findDraftDetail(' arbitrary-id ');
        expect(prisma.payrollRuleSet.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.payrollRuleSet.findUnique).toHaveBeenCalledWith({
          where: { id: ' arbitrary-id ' },
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
        expect(result).toEqual({
          id: draft.id,
          jurisdictionCode: 'CO',
          version: 2,
          schemaVersion: 999,
          draftRevision: 4,
          rulesPayload: payload,
          approvedEffectiveFrom: '2026-01-01',
          approvedEffectiveTo: effectiveTo ? '2026-12-31' : null,
          status: 'DRAFT',
          publishedAt: null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
        expect(result.rulesPayload).toBe(payload);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.payrollRuleSet.findMany).not.toHaveBeenCalled();
        expect(prisma.payrollRuleSet.count).not.toHaveBeenCalled();
      },
    );
    it('distinguishes missing rows', async () => {
      prisma.payrollRuleSet.findUnique.mockResolvedValue(null);
      await expect(service.findDraftDetail('missing')).rejects.toMatchObject({
        code: 'RULE_SET_NOT_FOUND',
      });
    });
    it.each([PayrollRuleSetStatus.PUBLISHED])(
      'rejects non-draft %s',
      async (status) => {
        prisma.payrollRuleSet.findUnique.mockResolvedValue({
          ...draft,
          status,
        });
        await expect(service.findDraftDetail('id')).rejects.toMatchObject({
          code: 'RULE_SET_NOT_DRAFT',
        });
      },
    );
  });

  it('uses default pagination and executes list and count together', async () => {
    const result = await service.findAll();
    expect(result).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(prisma.payrollRuleSet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 20 }),
    );
    expect(prisma.payrollRuleSet.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith([
      prisma.payrollRuleSet.findMany.mock.results[0].value,
      prisma.payrollRuleSet.count.mock.results[0].value,
    ]);
  });

  it.each([
    { input: {}, page: 1, limit: 20, skip: 0 },
    { input: { page: 0, limit: 0 }, page: 1, limit: 1, skip: 0 },
    { input: { page: -3, limit: -5 }, page: 1, limit: 1, skip: 0 },
    { input: { page: 3, limit: 10 }, page: 3, limit: 10, skip: 20 },
    { input: { page: 2, limit: 101 }, page: 2, limit: 100, skip: 100 },
    { input: { page: 2, limit: 100 }, page: 2, limit: 100, skip: 100 },
  ])(
    'normalizes pagination for $input',
    async ({ input, page, limit, skip }) => {
      expect(await service.findAll(input)).toMatchObject({ page, limit });
      expect(prisma.payrollRuleSet.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip, take: limit }),
      );
    },
  );

  it.each<PayrollRuleSetQueryInput>([
    { jurisdictionCode: 'CO' },
    { status: PayrollRuleSetStatus.DRAFT },
    { jurisdictionCode: 'CO', status: PayrollRuleSetStatus.PUBLISHED },
  ])('uses identical filters for list and count: %j', async (input) => {
    await service.findAll(input);
    const listWhere = prisma.payrollRuleSet.findMany.mock.calls[0][0].where;
    const countWhere = prisma.payrollRuleSet.count.mock.calls[0][0].where;
    expect(listWhere).toEqual(input);
    expect(countWhere).toBe(listWhere);
  });

  it('uses deterministic ordering and selects exactly metadata without payload or relations', async () => {
    await service.findAll();
    const args = prisma.payrollRuleSet.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([
      { jurisdictionCode: 'asc' },
      { version: 'desc' },
      { id: 'asc' },
    ]);
    expect(args.select).toEqual({
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
    });
    expect(args).not.toHaveProperty('include');
    expect(args.select).not.toHaveProperty('rulesPayload');
    expect(args.select).not.toHaveProperty('payrollPeriods');
    expect(args.select).not.toHaveProperty('employmentTerminations');
  });

  it('returns the total count and rounds totalPages up', async () => {
    prisma.payrollRuleSet.count.mockResolvedValue(41);
    expect(await service.findAll({ page: 2 })).toMatchObject({
      page: 2,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
  });

  it('returns an empty result with zero totalPages', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([]);
    prisma.payrollRuleSet.count.mockResolvedValue(0);
    expect(await service.findAll()).toEqual({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('serializes only date-only fields as UTC YYYY-MM-DD', async () => {
    const result = await service.findAll();
    expect(result.data).toEqual([
      {
        ...row,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
      },
    ]);
    expect(result.data[0].publishedAt).toBe(row.publishedAt);
    expect(result.data[0].createdAt).toBe(row.createdAt);
    expect(result.data[0].updatedAt).toBe(row.updatedAt);
    expect(row.effectiveFrom).toBeInstanceOf(Date);
  });

  it('preserves nullable effectiveTo and publishedAt', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([
      { ...row, effectiveTo: null, publishedAt: null },
    ]);
    expect((await service.findAll()).data[0]).toMatchObject({
      effectiveTo: null,
      publishedAt: null,
    });
  });

  it('lists unsupported schemaVersion metadata without decoding a payload', async () => {
    prisma.payrollRuleSet.findMany.mockResolvedValue([
      { ...row, schemaVersion: 999 },
    ]);
    expect((await service.findAll()).data[0]).toEqual({
      ...row,
      schemaVersion: 999,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
    });
  });
});
