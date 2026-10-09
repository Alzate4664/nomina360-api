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
  EditPayrollRuleSetDraftInput,
  PayrollRuleSetDraftEditingService,
} from './payroll-rule-set-draft-editing.service';

describe('PayrollRuleSetDraftEditingService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    payrollRuleSet: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() };
  const audit = { log: jest.fn() };
  const actor = {
    id: 'actor',
    isActive: true,
    role: UserRole.SUPER_ADMIN,
    companyId: null,
  };
  let input: EditPayrollRuleSetDraftInput;
  let current: {
    id: string;
    jurisdictionCode: string;
    version: number;
    schemaVersion: number;
    draftRevision: number;
    rulesPayload: unknown;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    status: string;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  let order: string[];
  let service: PayrollRuleSetDraftEditingService;
  beforeEach(() => {
    jest.resetAllMocks();
    order = [];
    input = {
      ruleSetId: 'draft',
      expectedDraftRevision: 1,
      schemaVersion: 1,
      rulesPayload: serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES)
        .rulesPayload,
      approvedEffectiveFrom: '0001-01-01',
      approvedEffectiveTo: '0002-01-01',
    };
    current = {
      id: 'draft',
      jurisdictionCode: 'CO',
      version: 3,
      schemaVersion: 1,
      draftRevision: 1,
      rulesPayload: JSON.parse(JSON.stringify(input.rulesPayload)) as unknown,
      effectiveFrom: new Date('0001-01-01T00:00:00.000Z'),
      effectiveTo: new Date('0002-01-01T00:00:00.000Z'),
      status: 'DRAFT',
      publishedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
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
      const first = tx.$queryRaw.mock.calls.length === 1;
      order.push(first ? 'actor' : 'target');
      return Promise.resolve(first ? [actor] : [{ id: current.id }]);
    });
    tx.payrollRuleSet.findUnique.mockImplementation(() => {
      order.push('read');
      return Promise.resolve({ ...current });
    });
    tx.payrollRuleSet.updateMany.mockImplementation(
      (args: { data: Partial<typeof current> }) => {
        order.push('update');
        Object.assign(current, args.data, {
          updatedAt: new Date('2026-02-01'),
        });
        return Promise.resolve({ count: 1 });
      },
    );
    audit.log.mockImplementation(() => {
      order.push('audit');
      return Promise.resolve({});
    });
    service = new PayrollRuleSetDraftEditingService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });
  const edit = (value: unknown = input, actorId: unknown = actor.id) =>
    service.editDraft(value as EditPayrollRuleSetDraftInput, actorId as string);
  const changed = () => ({ ...input, approvedEffectiveTo: null });
  const noWrite = () => {
    expect(tx.payrollRuleSet.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  };

  it.each(['', ' ', null, 1, new String('actor')])(
    'rejects actor %p before transaction',
    async (id) => {
      await expect(edit(input, id)).rejects.toMatchObject({
        code: 'INVALID_ACTOR_USER_ID',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['', ' ', null, 1, new String('draft')])(
    'rejects target id %p before transaction',
    async (ruleSetId) => {
      await expect(edit({ ...input, ruleSetId })).rejects.toMatchObject({
        code: 'INVALID_RULE_SET_ID',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    'companyId',
    'actorUserId',
    'userId',
    'id',
    'jurisdictionCode',
    'version',
    'draftRevision',
    'status',
    'publishedAt',
    'createdAt',
    'updatedAt',
    'extra',
  ])('rejects extra %s', async (key) => {
    await expect(edit({ ...input, [key]: 1 })).rejects.toMatchObject({
      code: 'INVALID_EDIT_INPUT',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects non-data objects, every missing field, symbols and getters without invoking them', async () => {
    class Data {
      constructor() {
        Object.assign(this, input);
      }
    }
    const getter = jest.fn();
    const invalid: unknown[] = [
      null,
      [],
      new Data(),
      { ...input, [Symbol('extra')]: 1 },
      Object.defineProperty({ ...input }, 'rulesPayload', { get: getter }),
      Object.defineProperty({ ...input }, 'schemaVersion', {
        enumerable: false,
      }),
    ];
    for (const key of Object.keys(input)) {
      const missing = { ...input } as Record<string, unknown>;
      delete missing[key];
      invalid.push(missing);
    }
    for (const value of invalid)
      await expect(edit(value)).rejects.toMatchObject({
        code: 'INVALID_EDIT_INPUT',
      });
    expect(getter).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('accepts a null-prototype input', async () => {
    const value: unknown = Object.assign(Object.create(null) as object, input);
    await edit(value);
    noWrite();
  });
  it.each([
    0,
    -1,
    1.5,
    '1',
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    2147483648,
  ])(
    'rejects revision %p before transaction',
    async (expectedDraftRevision) => {
      await expect(
        edit({ ...input, expectedDraftRevision }),
      ).rejects.toMatchObject({ code: 'INVALID_EXPECTED_DRAFT_REVISION' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { approvedEffectiveFrom: '0000-01-01' },
    { approvedEffectiveTo: undefined },
    { approvedEffectiveTo: '0001-01-01' },
    { approvedEffectiveTo: '0000-12-31' },
    { approvedEffectiveFrom: '2026-02-30' },
  ])('preserves envelope errors %p', async (override) => {
    await expect(edit({ ...input, ...override })).rejects.toBeInstanceOf(
      PayrollRuleSetDomainError,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each([undefined, { invalid: undefined }, { value: NaN }, new Date()])(
    'preserves canonical errors %p',
    async (rulesPayload) => {
      await expect(edit({ ...input, rulesPayload })).rejects.toBeInstanceOf(
        PayrollRuleSetDomainError,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([{ schemaVersion: 2 }, { rulesPayload: {} }])(
    'preserves codec errors %p',
    async (override) => {
      await expect(edit({ ...input, ...override })).rejects.toBeInstanceOf(
        PayrollRulesPayloadValidationError,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { rows: [] },
    { rows: [{ ...actor, isActive: false }] },
    { rows: [{ ...actor, role: UserRole.ADMIN }] },
    { rows: [{ ...actor, companyId: 'tenant' }] },
    { rows: [actor, actor] },
  ])('fails closed for actor %p', async ({ rows }) => {
    tx.$queryRaw.mockResolvedValueOnce(rows);
    await expect(edit()).rejects.toMatchObject({
      code: 'PLATFORM_ACTOR_UNAUTHORIZED',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.payrollRuleSet.findUnique).not.toHaveBeenCalled();
    noWrite();
  });
  it('locks actor before target by parameterized ID only with READ COMMITTED', async () => {
    await edit();
    expect(order).toEqual(['begin', 'actor', 'target', 'read', 'commit']);
    const calls = tx.$queryRaw.mock.calls as [TemplateStringsArray, string][];
    expect(calls[0][0].join('?')).toContain(
      'SELECT "id", "isActive", "role", "companyId"',
    );
    expect(calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(calls[0][1]).toBe(actor.id);
    expect(calls[1][0].join('?').replace(/\s+/g, ' ').trim()).toBe(
      'SELECT "id" FROM "PayrollRuleSet" WHERE "id" = ? FOR UPDATE',
    );
    expect(calls[1][1]).toBe(input.ruleSetId);
    expect(
      (prisma.$transaction.mock.calls[0] as [unknown, unknown])[1],
    ).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });
  it('retains whitespace in valid actor and target IDs', async () => {
    current.id = ' draft ';
    await edit({ ...input, ruleSetId: current.id }, ' actor ');
    expect((tx.$queryRaw.mock.calls[0] as [unknown, string])[1]).toBe(
      ' actor ',
    );
    expect((tx.$queryRaw.mock.calls[1] as [unknown, string])[1]).toBe(
      ' draft ',
    );
  });
  it('reports missing target before read', async () => {
    tx.$queryRaw.mockResolvedValueOnce([actor]).mockResolvedValueOnce([]);
    await expect(edit()).rejects.toMatchObject({ code: 'RULE_SET_NOT_FOUND' });
    expect(tx.payrollRuleSet.findUnique).not.toHaveBeenCalled();
  });
  it('reports lock/read inconsistency', async () => {
    tx.payrollRuleSet.findUnique.mockResolvedValueOnce(null);
    await expect(edit()).rejects.toMatchObject({
      code: 'DRAFT_EDIT_INVARIANT_VIOLATION',
    });
    noWrite();
  });
  it('rejects published target', async () => {
    current.status = 'PUBLISHED';
    await expect(edit()).rejects.toMatchObject({ code: 'RULE_SET_NOT_DRAFT' });
    noWrite();
  });
  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])(
    'maps corrupt persisted revision %p to invariant error',
    async (draftRevision) => {
      current.draftRevision = draftRevision;
      await expect(edit()).rejects.toMatchObject({
        code: 'DRAFT_EDIT_INVARIANT_VIOLATION',
      });
      noWrite();
    },
  );
  it.each([
    { publishedAt: new Date() },
    { effectiveFrom: new Date('invalid') },
    { effectiveTo: new Date('0001-01-01') },
    { effectiveFrom: new Date('0001-01-01T01:00:00Z') },
  ])('maps impossible DRAFT metadata %p', async (override) => {
    Object.assign(current, override);
    await expect(edit()).rejects.toMatchObject({
      code: 'DRAFT_EDIT_INVARIANT_VIOLATION',
    });
    noWrite();
  });
  it.each([false, true])(
    'rejects stale revision even when identical=%p',
    async (identical) => {
      current.draftRevision = 2;
      await expect(edit(identical ? input : changed())).rejects.toMatchObject({
        code: 'STALE_DRAFT_REVISION',
      });
      noWrite();
    },
  );
  it('checks stale revision before canonical comparison', async () => {
    current.draftRevision = 2;
    current.rulesPayload = { invalid: undefined };
    await expect(edit()).rejects.toMatchObject({
      code: 'STALE_DRAFT_REVISION',
    });
  });
  it('returns unchanged metadata on identical content', async () => {
    const result = await edit();
    expect(result.draftRevision).toBe(1);
    expect(result.createdAt).toBe(current.createdAt);
    expect(result.updatedAt).toBe(current.updatedAt);
    expect(result).not.toHaveProperty('rulesPayload');
    expect(result).not.toHaveProperty('effectiveFrom');
    expect(result).not.toHaveProperty('changed');
    expect(result.approvedEffectiveFrom).toBe('0001-01-01');
    noWrite();
  });
  it('ignores property ordering including nested objects', async () => {
    const reorder = (value: unknown): unknown => {
      if (value === null || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, nested]) => [key, reorder(nested)]),
      );
    };
    await edit({ ...input, rulesPayload: reorder(input.rulesPayload) });
    noWrite();
  });
  it('allows no-op at maximum revision', async () => {
    current.draftRevision = 2147483647;
    expect(
      (await edit({ ...input, expectedDraftRevision: current.draftRevision }))
        .draftRevision,
    ).toBe(2147483647);
    noWrite();
  });
  it.each([
    { approvedEffectiveFrom: '0001-02-01' },
    { approvedEffectiveTo: '0003-01-01' },
    { approvedEffectiveTo: null },
  ])('increments for envelope change %p', async (override) => {
    expect((await edit({ ...input, ...override })).draftRevision).toBe(2);
    expect(tx.payrollRuleSet.updateMany).toHaveBeenCalledTimes(1);
  });
  it('increments for open to closed end', async () => {
    current.effectiveTo = null;
    expect((await edit()).draftRevision).toBe(2);
  });
  it('persists exact decimal spelling and detaches without mutating source', async () => {
    (current.rulesPayload as { minimumWage: string }).minimumWage = '1';
    (input.rulesPayload as { minimumWage: string }).minimumWage = '1.0';
    const original = JSON.stringify(input);
    await edit();
    expect(JSON.stringify(input)).toBe(original);
    expect((current.rulesPayload as { minimumWage: string }).minimumWage).toBe(
      '1.0',
    );
    expect(current.rulesPayload).not.toBe(input.rulesPayload);
    expect(current.draftRevision).toBe(2);
  });
  it('captures every input value before transaction and later mutation', async () => {
    const value = changed();
    const originalPayload = JSON.parse(
      JSON.stringify(value.rulesPayload),
    ) as unknown;
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        Object.assign(value, {
          ruleSetId: 'other',
          expectedDraftRevision: 9,
          schemaVersion: 2,
          approvedEffectiveFrom: '2020-01-01',
          approvedEffectiveTo: '2021-01-01',
        });
        (value.rulesPayload as { minimumWage: string }).minimumWage = '99';
        return callback(tx);
      },
    );
    await edit(value);
    expect((tx.$queryRaw.mock.calls[1] as [unknown, string])[1]).toBe('draft');
    expect(current).toMatchObject({
      schemaVersion: 1,
      draftRevision: 2,
      effectiveFrom: new Date('0001-01-01T00:00:00.000Z'),
      effectiveTo: null,
      rulesPayload: originalPayload,
    });
  });
  it.each([
    [1, 2],
    [2147483646, 2147483647],
  ])('increments %p to %p', async (revision, next) => {
    current.draftRevision = revision;
    expect(
      (await edit({ ...changed(), expectedDraftRevision: revision }))
        .draftRevision,
    ).toBe(next);
  });
  it('rejects exhausted change without update or audit', async () => {
    current.draftRevision = 2147483647;
    await expect(
      edit({ ...changed(), expectedDraftRevision: current.draftRevision }),
    ).rejects.toMatchObject({ code: 'DRAFT_REVISION_EXHAUSTED' });
    noWrite();
  });
  it('guards update, writes only editable fields, rereads metadata then audits exact values in same tx', async () => {
    const oldValue = {
      id: current.id,
      jurisdictionCode: 'CO',
      version: 3,
      schemaVersion: 1,
      draftRevision: 1,
      approvedEffectiveFrom: input.approvedEffectiveFrom,
      approvedEffectiveTo: input.approvedEffectiveTo,
      status: 'DRAFT',
      publishedAt: null,
    };
    const result = await edit(changed());
    expect(order).toEqual([
      'begin',
      'actor',
      'target',
      'read',
      'update',
      'read',
      'audit',
      'commit',
    ]);
    const [args] = tx.payrollRuleSet.updateMany.mock.calls[0] as [
      {
        where: unknown;
        data: Record<string, unknown>;
      },
    ];
    expect(args.where).toEqual({
      id: 'draft',
      status: 'DRAFT',
      draftRevision: 1,
    });
    expect(Object.keys(args.data).sort()).toEqual(
      [
        'schemaVersion',
        'rulesPayload',
        'effectiveFrom',
        'effectiveTo',
        'draftRevision',
      ].sort(),
    );
    const [read] = tx.payrollRuleSet.findUnique.mock.calls[1] as [
      {
        select: Record<string, boolean>;
      },
    ];
    expect(read.select).not.toHaveProperty('rulesPayload');
    expect(audit.log).toHaveBeenCalledWith(
      {
        userId: actor.id,
        action: 'EDIT_PAYROLL_RULE_SET_DRAFT',
        entity: 'PayrollRuleSet',
        entityId: 'draft',
        oldValue,
        newValue: { ...oldValue, draftRevision: 2, approvedEffectiveTo: null },
      },
      tx,
    );
    expect(Object.keys(result).sort()).toEqual(
      [...Object.keys(oldValue), 'createdAt', 'updatedAt'].sort(),
    );
  });
  it('rejects zero update count without reread/audit/retry', async () => {
    tx.payrollRuleSet.updateMany.mockResolvedValue({ count: 0 });
    await expect(edit(changed())).rejects.toMatchObject({
      code: 'DRAFT_EDIT_INVARIANT_VIOLATION',
    });
    expect(tx.payrollRuleSet.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.payrollRuleSet.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('rejects missing metadata after update', async () => {
    tx.payrollRuleSet.findUnique
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(null);
    await expect(edit(changed())).rejects.toMatchObject({
      code: 'DRAFT_EDIT_INVARIANT_VIOLATION',
    });
    expect(audit.log).not.toHaveBeenCalled();
  });
  it('propagates audit failure without commit', async () => {
    const error = new Error('audit failure');
    audit.log.mockRejectedValue(error);
    await expect(edit(changed())).rejects.toBe(error);
    expect(order).not.toContain('commit');
  });
  it.each(['lock', 'read', 'update'])(
    'propagates unexpected DB %s error',
    async (stage) => {
      const error = new Error('connection/deadlock');
      if (stage === 'lock') tx.$queryRaw.mockRejectedValue(error);
      if (stage === 'read')
        tx.payrollRuleSet.findUnique.mockRejectedValue(error);
      if (stage === 'update')
        tx.payrollRuleSet.updateMany.mockRejectedValue(error);
      await expect(edit(changed())).rejects.toBe(error);
      expect(order).not.toContain('commit');
    },
  );
});
