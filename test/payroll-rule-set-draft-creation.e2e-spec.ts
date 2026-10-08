import { PayrollRuleSetStatus, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../src/audit/audit.service';
import {
  CreatePayrollRuleSetDraftInput,
  PayrollRuleSetDraftCreationService,
} from '../src/payroll/rules/payroll-rule-set-draft-creation.service';
import { PayrollRulesPayloadV1 } from '../src/payroll/rules/payroll-rules-codec';
import { PrismaService } from '../src/prisma/prisma.service';

// Entirely synthetic values; these are not Colombian/legal payroll rules.
const payload: PayrollRulesPayloadV1 = {
  minimumWage: '17',
  salary: { monthlyDayBasis: 13 },
  standardMonthlyHours: '19',
  overtime: { daytimeMultiplier: '1.13', nighttimeMultiplier: '1.17' },
  surcharges: { nighttimeRate: '0.13', sundayHolidayRate: '0.17' },
  contributions: { employeeHealthRate: '0.11', employeePensionRate: '0.13' },
  transportAllowance: {
    monthlyAmount: '7',
    salaryLimitInMinimumWages: '3',
    monthlyProrationDayBasis: 13,
  },
  severance: { daysPerYear: 117, interestAnnualRate: '0.07' },
  serviceBonus: { daysPerYear: 119 },
  sickLeave: {
    monthlyIbcDayBasis: 13,
    commonDiseaseFirstRangeEndDay: 7,
    commonDiseaseFirstRate: '0.71',
    commonDiseaseSecondRangeEndDay: 17,
    commonDiseaseSecondRate: '0.31',
    workRiskRate: '0.91',
  },
};
const jurisdictions = ['QJ', 'QK'];
const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 20_000,
};
const waitLimit = 8_000;

jest.setTimeout(30_000);

function requireTestDatabase(): void {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const name = decodeURIComponent(url.pathname.slice(1));
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !name ||
      name.includes('/') ||
      !/(test|e2e)/i.test(name)
    ) {
      throw new Error();
    }
  } catch {
    // Never include the URL or a parser error (which could contain credentials).
    throw new Error(
      'Draft creation E2E requires a PostgreSQL test DATABASE_URL.',
    );
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

async function settleHeld(transactions: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(transactions);
  for (const result of results) {
    if (result.status === 'rejected') {
      const reason: unknown = result.reason;
      throw reason;
    }
  }
}

async function bounded<T>(
  promise: Promise<T>,
  description: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${description}`)),
          waitLimit,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function input(
  jurisdictionCode = jurisdictions[0],
): CreatePayrollRuleSetDraftInput {
  return {
    jurisdictionCode,
    schemaVersion: 1,
    rulesPayload: JSON.parse(JSON.stringify(payload)) as PayrollRulesPayloadV1,
    approvedEffectiveFrom: '2093-02-01',
    approvedEffectiveTo: '2094-02-01',
  };
}

describe('Internal PayrollRuleSetDraftCreationService PostgreSQL (e2e)', () => {
  let database: PrismaService;
  let second: PrismaService;
  let observer: PrismaService;
  let actors: string[];
  let companyId: string;
  let predecessorId: string;
  let draftIds: string[];
  let auditIds: string[];
  let collisionCheckPassed = false;

  beforeAll(async () => {
    requireTestDatabase();
    database = new PrismaService();
    second = new PrismaService();
    observer = new PrismaService();
    await Promise.all([
      database.$connect(),
      second.$connect(),
      observer.$connect(),
    ]);
  });

  afterAll(async () => {
    await Promise.all([
      database?.$disconnect(),
      second?.$disconnect(),
      observer?.$disconnect(),
    ]);
  });

  function auditWhere(): Prisma.AuditLogWhereInput {
    return {
      OR: [
        { userId: { in: actors } },
        { entityId: { in: [predecessorId, ...draftIds] } },
        { id: { in: auditIds } },
        ...jurisdictions.map((code) => ({
          entity: 'PayrollRuleSet',
          newValue: { path: ['jurisdictionCode'], equals: code },
        })),
      ],
    };
  }

  async function assertAbsent(): Promise<void> {
    requireTestDatabase();
    expect(
      await observer.payrollRuleSet.count({
        where: {
          OR: [
            { jurisdictionCode: { in: jurisdictions } },
            { id: { in: [predecessorId, ...draftIds] } },
          ],
        },
      }),
    ).toBe(0);
    expect(await observer.auditLog.count({ where: auditWhere() })).toBe(0);
    expect(
      await observer.user.count({
        where: {
          OR: [
            { id: { in: actors } },
            { email: { in: actors.map((id) => `${id}@example.invalid`) } },
          ],
        },
      }),
    ).toBe(0);
    expect(
      await observer.company.count({
        where: { OR: [{ id: companyId }, { nit: companyId }] },
      }),
    ).toBe(0);
  }

  beforeEach(async () => {
    collisionCheckPassed = false;
    const suffix = randomUUID();
    actors = [0, 1, 2, 3].map((i) => `e2e-prs-create-${suffix}-actor-${i}`);
    companyId = `e2e-prs-create-${suffix}-company`;
    predecessorId = `e2e-prs-create-${suffix}-predecessor`;
    draftIds = [];
    auditIds = [];
    // A collision fails closed; nothing is removed or replaced.
    await assertAbsent();
    collisionCheckPassed = true;
  });

  afterEach(async () => {
    if (collisionCheckPassed) await assertAbsent();
  });

  async function actor(
    tx: Prisma.TransactionClient,
    id = actors[0],
    role: UserRole = UserRole.SUPER_ADMIN,
    isActive = true,
  ): Promise<void> {
    requireTestDatabase();
    if (role !== UserRole.SUPER_ADMIN) {
      await tx.company.create({
        data: {
          id: companyId,
          name: 'Synthetic draft creation E2E',
          nit: companyId,
          email: `${companyId}@example.invalid`,
        },
      });
    }
    await tx.user.create({
      data: {
        id,
        name: 'Synthetic platform actor',
        email: `${id}@example.invalid`,
        passwordHash: 'synthetic-noncredential-never-used-for-login',
        role,
        isActive,
        companyId: role === UserRole.SUPER_ADMIN ? null : companyId,
      },
    });
  }

  function serviceFor(
    tx: Prisma.TransactionClient,
    audit = new AuditService(database),
  ) {
    // Only transaction boundaries are overridden. Every delegate and SQL call is real.
    // This does not prove the service's own commit boundary (covered by its unit spec).
    const prisma = {
      $transaction: <T>(
        callback: (client: Prisma.TransactionClient) => Promise<T>,
      ) => {
        requireTestDatabase();
        return callback(tx);
      },
    } as unknown as PrismaService;
    return new PayrollRuleSetDraftCreationService(prisma, audit);
  }

  async function rollback(
    callback: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    requireTestDatabase();
    const sentinel = new Error('private ordinary rollback sentinel');
    try {
      await database.$transaction(async (tx) => {
        await callback(tx);
        throw sentinel;
      }, options);
    } catch (error) {
      if (error !== sentinel) throw error;
    }
  }

  async function create(
    tx: Prisma.TransactionClient,
    code = jurisdictions[0],
    id = actors[0],
  ) {
    const result = await serviceFor(tx).createDraft(input(code), id);
    draftIds.push(result.id);
    return result;
  }

  async function assertAudit(
    tx: Prisma.TransactionClient,
    id: string,
    userId = actors[0],
  ) {
    const row = await tx.auditLog.findFirstOrThrow({ where: { entityId: id } });
    auditIds.push(row.id);
    expect(row).toMatchObject({
      userId,
      companyId: null,
      action: 'CREATE_PAYROLL_RULE_SET_DRAFT',
      entity: 'PayrollRuleSet',
      entityId: id,
      oldValue: null,
    });
    const draft = await tx.payrollRuleSet.findUniqueOrThrow({ where: { id } });
    expect(row.newValue).toEqual({
      id,
      jurisdictionCode: draft.jurisdictionCode,
      version: draft.version,
      schemaVersion: 1,
      draftRevision: 1,
      status: 'DRAFT',
      approvedEffectiveFrom: '2093-02-01',
      approvedEffectiveTo: '2094-02-01',
      publishedAt: null,
    });
    expect(row.newValue).not.toHaveProperty('rulesPayload');
    return row;
  }

  async function predecessor(
    tx: Prisma.TransactionClient,
    version: number,
  ): Promise<void> {
    requireTestDatabase();
    await tx.payrollRuleSet.create({
      data: {
        id: predecessorId,
        jurisdictionCode: jurisdictions[0],
        version,
        schemaVersion: 1,
        status: PayrollRuleSetStatus.DRAFT,
        draftRevision: 1,
        effectiveFrom: new Date('2093-02-01T00:00:00.000Z'),
        effectiveTo: new Date('2094-02-01T00:00:00.000Z'),
        rulesPayload: payload as unknown as Prisma.InputJsonValue,
        publishedAt: null,
      },
    });
  }

  it('creates version 1 with approved dates, synthetic payload and metadata-only audit', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const result = await create(tx);
      expect(result).toMatchObject({
        version: 1,
        status: 'DRAFT',
        draftRevision: 1,
        publishedAt: null,
        approvedEffectiveFrom: '2093-02-01',
        approvedEffectiveTo: '2094-02-01',
      });
      expect(
        await tx.payrollRuleSet.findUniqueOrThrow({ where: { id: result.id } }),
      ).toMatchObject({
        version: 1,
        status: 'DRAFT',
        draftRevision: 1,
        publishedAt: null,
        effectiveFrom: new Date('2093-02-01T00:00:00.000Z'),
        effectiveTo: new Date('2094-02-01T00:00:00.000Z'),
        rulesPayload: payload,
      });
      await assertAudit(tx, result.id);
    });
  });

  it('sees sequential predecessors and allocates MAX rather than COUNT', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const first = await create(tx);
      const next = await create(tx);
      expect([first.version, next.version]).toEqual([1, 2]);
      await assertAudit(tx, first.id);
      await assertAudit(tx, next.id);
      await predecessor(tx, 17);
      const afterGap = await create(tx);
      expect(afterGap.version).toBe(18);
      await assertAudit(tx, afterGap.id);
      expect(await tx.auditLog.count({ where: auditWhere() })).toBe(3);
    });
  });

  // User_role_company_scope_check in 20261007215512 prevents a SUPER_ADMIN
  // with non-null companyId. Do not construct that impossible state or bypass it.
  it.each(['missing', 'inactive', 'tenant'] as const)(
    'revalidates a real %s actor and leaves no draft/audit',
    async (kind) => {
      await rollback(async (tx) => {
        if (kind !== 'missing')
          await actor(
            tx,
            actors[0],
            kind === 'tenant' ? UserRole.VIEWER : UserRole.SUPER_ADMIN,
            kind !== 'inactive',
          );
        await expect(
          serviceFor(tx).createDraft(input(), actors[0]),
        ).rejects.toMatchObject({ code: 'PLATFORM_ACTOR_UNAUTHORIZED' });
        expect(
          await tx.payrollRuleSet.count({
            where: { jurisdictionCode: { in: jurisdictions } },
          }),
        ).toBe(0);
        expect(await tx.auditLog.count({ where: auditWhere() })).toBe(0);
      });
    },
  );

  it('rejects a blank actor id without persistence', async () => {
    await rollback(async (tx) => {
      await expect(
        serviceFor(tx).createDraft(input(), '   '),
      ).rejects.toMatchObject({ code: 'INVALID_ACTOR_USER_ID' });
      expect(
        await tx.payrollRuleSet.count({
          where: { jurisdictionCode: { in: jurisdictions } },
        }),
      ).toBe(0);
      expect(await tx.auditLog.count({ where: auditWhere() })).toBe(0);
    });
  });

  function held(client: PrismaService, code: string, userId: string) {
    const pid = deferred<number>();
    const ready = deferred<{ id: string; version: number }>();
    const release = deferred<void>();
    const sentinel = new Error('private held transaction rollback sentinel');
    // Attach rejection handlers immediately, even before the test awaits barriers.
    void pid.promise.catch(() => undefined);
    void ready.promise.catch(() => undefined);
    requireTestDatabase();
    const settled = client
      .$transaction(async (tx) => {
        await actor(tx, userId);
        const rows = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        pid.resolve(rows[0].pid);
        const result = await create(tx, code, userId);
        await assertAudit(tx, result.id, userId);
        ready.resolve(result);
        await bounded(release.promise, 'held transaction release');
        throw sentinel;
      }, options)
      .then(
        () => {
          throw new Error('Held transaction unexpectedly committed.');
        },
        (error: unknown) => {
          if (error !== sentinel) {
            pid.reject(error);
            ready.reject(error);
            throw error;
          }
        },
      );
    void settled.catch(() => undefined);
    return {
      pid: pid.promise,
      ready: ready.promise,
      release: () => release.resolve(),
      settled,
    };
  }

  async function observeBlocking(
    blocked: number,
    blocker: number,
  ): Promise<void> {
    const deadline = Date.now() + waitLimit;
    while (Date.now() < deadline) {
      requireTestDatabase();
      const rows = await bounded(
        observer.$queryRaw<Array<{ blockers: number[] }>>`
        SELECT pg_blocking_pids(${blocked}::integer) AS blockers
      `,
        'blocking state query',
      );
      if (rows[0].blockers.includes(blocker)) return;
      // Bounded polling backoff only; elapsed time is never evidence of locking.
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('PostgreSQL did not report A blocking B.');
  }

  it('serializes the same jurisdiction on the real advisory transaction lock', async () => {
    const a = held(database, jurisdictions[0], actors[0]);
    let b: ReturnType<typeof held> | undefined;
    try {
      expect((await bounded(a.ready, 'A creation')).version).toBe(1);
      b = held(second, jurisdictions[0], actors[1]);
      const [aPid, bPid] = await Promise.all([
        a.pid,
        bounded(b.pid, 'B backend'),
      ]);
      expect(aPid).not.toBe(bPid);
      await observeBlocking(bPid, aPid);
      // Distinct actors exclude User FOR UPDATE as the source of contention.
      const locks = await observer.$queryRaw<
        Array<{ pid: number; granted: boolean }>
      >`
        SELECT pid, granted FROM pg_locks
        WHERE locktype = 'advisory' AND pid IN (${aPid}::integer, ${bPid}::integer)
      `;
      expect(locks).toEqual(
        expect.arrayContaining([
          { pid: aPid, granted: true },
          { pid: bPid, granted: false },
        ]),
      );
      a.release();
      await bounded(a.settled, 'A rollback');
      expect(
        (await bounded(b.ready, 'B creation after A rollback')).version,
      ).toBe(1);
    } finally {
      a.release();
      b?.release();
      await settleHeld([a.settled, ...(b ? [b.settled] : [])]);
    }
  });

  it('allows another jurisdiction to complete before releasing A', async () => {
    const a = held(database, jurisdictions[0], actors[0]);
    let b: ReturnType<typeof held> | undefined;
    try {
      await bounded(a.ready, 'A creation');
      b = held(second, jurisdictions[1], actors[1]);
      expect(
        await bounded(b.ready, 'independent B creation while A held'),
      ).toMatchObject({ version: 1 });
      expect(await a.pid).not.toBe(await b.pid);
      // A's release barrier has not been signalled; B has completed real creation.
    } finally {
      a.release();
      b?.release();
      await settleHeld([a.settled, ...(b ? [b.settled] : [])]);
    }
  });

  it('keeps the draft and real audit in the same uncommitted transaction', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const result = await create(tx);
      const audit = await assertAudit(tx, result.id);
      expect(await tx.payrollRuleSet.count({ where: { id: result.id } })).toBe(
        1,
      );
      requireTestDatabase();
      await observer.$transaction(async (outside) => {
        expect(
          await outside.payrollRuleSet.count({ where: { id: result.id } }),
        ).toBe(0);
        expect(await outside.auditLog.count({ where: { id: audit.id } })).toBe(
          0,
        );
      }, options);
    });
    await assertAbsent();
  });

  it('rolls back the actual service transaction after a real audit INSERT succeeds', async () => {
    const audit = new AuditService(database);
    const realLog = audit.log.bind(audit) as AuditService['log'];
    const failure = new Error('controlled E2E failure after audit INSERT');
    let inserted = false;
    const spy = jest
      .spyOn(audit, 'log')
      .mockImplementation(async (data, tx) => {
        expect(tx).toBeDefined();
        const row = await realLog(data, tx);
        inserted = true;
        auditIds.push(row.id);
        if (data.entityId) draftIds.push(data.entityId);
        throw failure;
      });
    const prisma = {
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        transactionOptions: {
          isolationLevel?: Prisma.TransactionIsolationLevel;
        },
      ) => {
        requireTestDatabase();
        return database.$transaction(
          async (tx) => {
            await actor(tx);
            return callback(tx);
          },
          { ...options, ...transactionOptions },
        );
      },
    } as unknown as PrismaService;
    try {
      const service = new PayrollRuleSetDraftCreationService(prisma, audit);
      // The controlled error escapes the REAL transaction. No harness sentinel.
      await expect(service.createDraft(input(), actors[0])).rejects.toBe(
        failure,
      );
      expect(inserted).toBe(true);
      expect(auditIds).toHaveLength(1);
      expect(draftIds).toHaveLength(1);
      await assertAbsent();
    } finally {
      spy.mockRestore();
    }
  });

  it('allocates INTEGER maximum and rejects exhaustion without another draft or audit', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      await predecessor(tx, 2147483646);
      const result = await create(tx);
      expect(result.version).toBe(2147483647);
      await assertAudit(tx, result.id);
      await expect(
        serviceFor(tx).createDraft(input(), actors[0]),
      ).rejects.toMatchObject({ code: 'VERSION_EXHAUSTED' });
      expect(
        await tx.payrollRuleSet.count({
          where: { jurisdictionCode: jurisdictions[0] },
        }),
      ).toBe(2);
      expect(await tx.auditLog.count({ where: auditWhere() })).toBe(1);
    });
  });
});
