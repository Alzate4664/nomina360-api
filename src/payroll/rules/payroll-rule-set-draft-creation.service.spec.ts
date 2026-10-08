import { Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';
import { PayrollRuleSetDomainError } from './domain/payroll-rule-set.errors';
import {
  PayrollRulesPayloadValidationError,
  serializePayrollRulesSnapshot,
} from './payroll-rules-codec';
import {
  CreatePayrollRuleSetDraftInput,
  PayrollRuleSetDraftCreationService,
} from './payroll-rule-set-draft-creation.service';

describe('PayrollRuleSetDraftCreationService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    payrollRuleSet: { aggregate: jest.fn(), create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const audit = { log: jest.fn() };
  const actor = {
    id: 'platform-actor',
    isActive: true,
    role: UserRole.SUPER_ADMIN,
    companyId: null,
  };
  let input: CreatePayrollRuleSetDraftInput;
  let service: PayrollRuleSetDraftCreationService;
  let order: string[];
  beforeEach(() => {
    jest.resetAllMocks();
    order = [];
    input = {
      jurisdictionCode: 'CO',
      schemaVersion: 1,
      rulesPayload: serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES)
        .rulesPayload,
      approvedEffectiveFrom: '0001-01-01',
      approvedEffectiveTo: '0002-01-01',
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        order.push('begin');
        const result = await callback(tx);
        order.push('commit');
        return result;
      },
    );
    tx.$queryRaw.mockImplementation(() => {
      order.push('actor');
      return Promise.resolve([actor]);
    });
    tx.$executeRaw.mockImplementation(() => {
      order.push('jurisdiction');
      return Promise.resolve(1);
    });
    tx.payrollRuleSet.aggregate.mockImplementation(() => {
      order.push('aggregate');
      return Promise.resolve({ _max: { version: null } });
    });
    tx.payrollRuleSet.create.mockImplementation(
      (args: { data: Record<string, unknown> }) => {
        order.push('create');
        return Promise.resolve({
          ...args.data,
          id: 'draft-id',
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        });
      },
    );
    audit.log.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve({});
    });
    service = new PayrollRuleSetDraftCreationService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });
  const create = (value: unknown, actorId: unknown = actor.id) =>
    service.createDraft(
      value as CreatePayrollRuleSetDraftInput,
      actorId as string,
    );

  it('captures detached JSON, persists and returns only metadata, and audits in lock order', async () => {
    const payload = input.rulesPayload as { minimumWage: string };
    payload.minimumWage = '1.0';
    const original = JSON.stringify(input);
    const result = await create(input);
    expect(order).toEqual([
      'begin',
      'actor',
      'jurisdiction',
      'aggregate',
      'create',
      'audit',
      'commit',
    ]);
    expect(JSON.stringify(input)).toBe(original);
    const transactionCall = prisma.$transaction.mock.calls[0] as [
      unknown,
      unknown,
    ];
    expect(transactionCall[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
    const actorCall = tx.$queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(actorCall[0].join('?')).toContain('FOR UPDATE');
    expect(actorCall[0].join('?')).toContain(
      'SELECT "id", "isActive", "role", "companyId"',
    );
    expect(actorCall[1]).toBe(actor.id);
    const lockCall = tx.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    expect(lockCall[1]).toBe('payroll-rules:CO');
    expect(lockCall[0].join('?')).toContain('hashtextextended(?, 0::bigint)');
    expect(tx.payrollRuleSet.aggregate).toHaveBeenCalledWith({
      where: { jurisdictionCode: 'CO' },
      _max: { version: true },
    });
    const [stored] = tx.payrollRuleSet.create.mock.calls[0] as [
      {
        data: Record<string, unknown>;
        select: Record<string, boolean>;
      },
    ];
    expect(stored.data).toEqual({
      jurisdictionCode: 'CO',
      version: 1,
      schemaVersion: 1,
      draftRevision: 1,
      status: 'DRAFT',
      publishedAt: null,
      effectiveFrom: new Date('0001-01-01T00:00:00.000Z'),
      effectiveTo: new Date('0002-01-01T00:00:00.000Z'),
      rulesPayload: input.rulesPayload,
    });
    expect(stored.data.rulesPayload).not.toBe(input.rulesPayload);
    expect(
      (stored.data.rulesPayload as { minimumWage: string }).minimumWage,
    ).toBe('1.0');
    expect(Object.keys(stored.select).sort()).toEqual(
      [
        'id',
        'jurisdictionCode',
        'version',
        'schemaVersion',
        'draftRevision',
        'status',
        'effectiveFrom',
        'effectiveTo',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        'id',
        'jurisdictionCode',
        'version',
        'schemaVersion',
        'draftRevision',
        'status',
        'approvedEffectiveFrom',
        'approvedEffectiveTo',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
    expect(result.approvedEffectiveFrom).toBe('0001-01-01');
    expect(result.approvedEffectiveTo).toBe('0002-01-01');
    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...metadata
    } = result;
    expect(_createdAt).toBeInstanceOf(Date);
    expect(_updatedAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(
      {
        userId: actor.id,
        action: 'CREATE_PAYROLL_RULE_SET_DRAFT',
        entity: 'PayrollRuleSet',
        entityId: result.id,
        newValue: metadata,
      },
      tx,
    );
  });
  it.each(['', '   ', null, 1])(
    'rejects invalid actor %p before transaction',
    async (id) => {
      await expect(create(input, id)).rejects.toMatchObject({
        code: 'INVALID_ACTOR_USER_ID',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    'extra',
    'companyId',
    'userId',
    'actorUserId',
    'id',
    'version',
    'draftRevision',
    'status',
    'publishedAt',
    'createdAt',
    'updatedAt',
  ])('rejects extra %s', async (key) => {
    await expect(create({ ...input, [key]: 'value' })).rejects.toMatchObject({
      code: 'INVALID_CREATE_INPUT',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects non-data objects, missing keys, symbols and accessors without invoking getters', async () => {
    const getter = jest.fn();
    const accessor = Object.defineProperty({ ...input }, 'rulesPayload', {
      get: getter,
    });
    for (const value of [
      null,
      [],
      new Date(),
      Object.assign(Object.create({}), input),
      { ...input, [Symbol('extra')]: 1 },
      accessor,
      { jurisdictionCode: 'CO' },
    ]) {
      await expect(create(value)).rejects.toMatchObject({
        code: 'INVALID_CREATE_INPUT',
      });
    }
    expect(getter).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['co', ' CO', 'CO ', 'CÓ', '', null])(
    'rejects jurisdiction %p',
    async (jurisdictionCode) => {
      await expect(
        create({ ...input, jurisdictionCode }),
      ).rejects.toMatchObject({ code: 'INVALID_JURISDICTION' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['0001-01-01', '0000-01-01', '0001-1-01', undefined])(
    'preserves envelope errors for %p',
    async (approvedEffectiveTo) => {
      await expect(
        create({ ...input, approvedEffectiveTo }),
      ).rejects.toBeInstanceOf(PayrollRuleSetDomainError);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([{ schemaVersion: 2 }, { rulesPayload: {} }])(
    'preserves codec errors %p',
    async (override) => {
      await expect(create({ ...input, ...override })).rejects.toBeInstanceOf(
        PayrollRulesPayloadValidationError,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('preserves canonical JSON errors before codec/transaction', async () => {
    await expect(
      create({ ...input, rulesPayload: { invalid: undefined } }),
    ).rejects.toBeInstanceOf(PayrollRuleSetDomainError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { rows: [] },
    { rows: [{ ...actor, isActive: false }] },
    { rows: [{ ...actor, role: UserRole.ADMIN }] },
    { rows: [{ ...actor, companyId: 'tenant' }] },
  ])('fails closed for actor %p', async ({ rows }) => {
    tx.$queryRaw.mockResolvedValue(rows);
    await expect(create(input)).rejects.toMatchObject({
      code: 'PLATFORM_ACTOR_UNAUTHORIZED',
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.payrollRuleSet.aggregate).not.toHaveBeenCalled();
    expect(tx.payrollRuleSet.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
  it.each([
    [null, 1],
    [1, 2],
    [2147483646, 2147483647],
  ])('allocates after maximum %p', async (maximum, expected) => {
    tx.payrollRuleSet.aggregate.mockResolvedValue({
      _max: { version: maximum },
    });
    expect(
      (await create({ ...input, approvedEffectiveTo: null })).version,
    ).toBe(expected);
    const [stored] = tx.payrollRuleSet.create.mock.calls[0] as [
      { data: { effectiveTo: Date | null } },
    ];
    expect(stored.data.effectiveTo).toBeNull();
  });
  it('rejects exhausted version before insert', async () => {
    tx.payrollRuleSet.aggregate.mockResolvedValue({
      _max: { version: 2147483647 },
    });
    await expect(create(input)).rejects.toMatchObject({
      code: 'VERSION_EXHAUSTED',
    });
    expect(tx.payrollRuleSet.create).not.toHaveBeenCalled();
  });
  it('maps only jurisdiction/version P2002 without retry', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError('conflict', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['jurisdictionCode', 'version'] },
    });
    tx.payrollRuleSet.create.mockRejectedValue(conflict);
    await expect(create(input)).rejects.toMatchObject({
      code: 'VERSION_ALLOCATION_CONFLICT',
    });
    expect(tx.payrollRuleSet.create).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
  });
  it.each([
    new Error('connection'),
    new Prisma.PrismaClientKnownRequestError('other unique', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['id'] },
    }),
  ])('propagates unrelated persistence error', async (error) => {
    tx.payrollRuleSet.create.mockRejectedValue(error);
    await expect(create(input)).rejects.toBe(error);
  });
  it('propagates audit failure without committing', async () => {
    const error = new Error('audit failure');
    audit.log.mockRejectedValue(error);
    await expect(create(input)).rejects.toBe(error);
    expect(order).not.toContain('commit');
  });
});
