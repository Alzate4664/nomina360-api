import {
  PayrollRuleSet,
  PayrollRuleSetStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../src/audit/audit.service';
import {
  EditPayrollRuleSetDraftInput,
  PayrollRuleSetDraftEditingService,
} from '../src/payroll/rules/payroll-rule-set-draft-editing.service';
import { PayrollRulesPayloadV1 } from '../src/payroll/rules/payroll-rules-codec';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  E2E_CO_PAYROLL_RULE_SET_DATA,
  E2E_CO_PAYROLL_RULE_SET_ID,
} from './fixtures/payroll-rule-set.fixture';

// Synthetic codec-valid values, not legal payroll parameters.
const payload: PayrollRulesPayloadV1 = {
  minimumWage: '1',
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
const jurisdiction = 'QL';
const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5_000,
  timeout: 25_000,
};
const waitLimit = 8_000;
jest.setTimeout(40_000);

function requireTestDatabase(): void {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    const name = decodeURIComponent(url.pathname.slice(1));
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      !name ||
      name.includes('/') ||
      !/(^|[^a-z0-9])(test|e2e)($|[^a-z0-9])/i.test(name)
    )
      throw new Error();
  } catch {
    throw new Error(
      'Draft editing E2E requires a PostgreSQL DATABASE_URL with a delimited test or e2e database-name token.',
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
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
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

describe('PayrollRuleSetDraftEditingService real PostgreSQL (e2e)', () => {
  let primary: PrismaService;
  let second: PrismaService;
  let observer: PrismaService;
  let actors: string[];
  let ids: string[];
  let companyId: string;
  let auditIds: string[];
  let checked = false;
  let baseline: PayrollRuleSet | undefined;
  const pending: Promise<void>[] = [];

  beforeAll(async () => {
    requireTestDatabase();
    primary = new PrismaService();
    requireTestDatabase();
    second = new PrismaService();
    requireTestDatabase();
    observer = new PrismaService();
    requireTestDatabase();
    await Promise.all([
      primary.$connect(),
      second.$connect(),
      observer.$connect(),
    ]);
  });
  afterAll(async () => {
    try {
      await settle();
    } finally {
      await Promise.all([
        primary?.$disconnect(),
        second?.$disconnect(),
        observer?.$disconnect(),
      ]);
    }
  });

  function auditWhere(): Prisma.AuditLogWhereInput {
    return {
      OR: [
        { userId: { in: actors } },
        { entityId: { in: ids } },
        { id: { in: auditIds } },
        {
          entity: 'PayrollRuleSet',
          newValue: { path: ['jurisdictionCode'], equals: jurisdiction },
        },
      ],
    };
  }
  async function assertAbsent() {
    requireTestDatabase();
    expect(
      await observer.payrollRuleSet.count({
        where: {
          OR: [{ id: { in: ids } }, { jurisdictionCode: jurisdiction }],
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
  async function settle() {
    const results = await Promise.allSettled(pending.splice(0));
    for (const result of results)
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        throw reason;
      }
  }
  beforeEach(async () => {
    checked = false;
    baseline = undefined;
    const suffix = randomUUID();
    actors = [0, 1].map((i) => `e2e-edit-${suffix}-actor-${i}`);
    ids = [0, 1].map((i) => `e2e-edit-${suffix}-draft-${i}`);
    companyId = `e2e-edit-${suffix}-company`;
    auditIds = [];
    await assertAbsent();
    checked = true;
  });
  afterEach(async () => {
    try {
      await settle();
    } finally {
      if (checked) await assertAbsent();
      if (baseline)
        expect(
          await observer.payrollRuleSet.findUnique({
            where: { id: baseline.id },
          }),
        ).toEqual(baseline);
    }
  });

  async function actor(
    tx: Prisma.TransactionClient,
    id = actors[0],
    role: UserRole = UserRole.SUPER_ADMIN,
    isActive = true,
  ) {
    if (role !== UserRole.SUPER_ADMIN)
      await tx.company.create({
        data: {
          id: companyId,
          nit: companyId,
          name: 'Synthetic E2E company',
          email: `${companyId}@example.invalid`,
        },
      });
    await tx.user.create({
      data: {
        id,
        name: 'Synthetic E2E actor',
        email: `${id}@example.invalid`,
        passwordHash: 'synthetic-noncredential-never-used-for-login',
        role,
        isActive,
        companyId: role === UserRole.SUPER_ADMIN ? null : companyId,
      },
    });
  }
  async function draft(
    tx: Prisma.TransactionClient,
    index = 0,
    revision = 1,
    published = false,
  ) {
    return tx.payrollRuleSet.create({
      data: {
        id: ids[index],
        jurisdictionCode: jurisdiction,
        version: index + 1,
        schemaVersion: 1,
        draftRevision: revision,
        status: published
          ? PayrollRuleSetStatus.PUBLISHED
          : PayrollRuleSetStatus.DRAFT,
        publishedAt: published ? new Date('2092-01-01T00:00:00.000Z') : null,
        effectiveFrom: new Date('2093-02-01T00:00:00.000Z'),
        effectiveTo: new Date('2094-02-01T00:00:00.000Z'),
        rulesPayload: payload as unknown as Prisma.InputJsonValue,
        createdAt: new Date('2091-01-01T00:00:00.000Z'),
        updatedAt: new Date('2091-02-01T00:00:00.000Z'),
      },
    });
  }
  function input(
    row: PayrollRuleSet,
    changed = false,
  ): EditPayrollRuleSetDraftInput {
    return {
      ruleSetId: row.id,
      expectedDraftRevision: row.draftRevision,
      schemaVersion: row.schemaVersion,
      rulesPayload: changed
        ? { ...payload, minimumWage: '23' }
        : row.rulesPayload,
      approvedEffectiveFrom: changed
        ? '2093-03-01'
        : row.effectiveFrom.toISOString().slice(0, 10),
      approvedEffectiveTo: changed
        ? null
        : (row.effectiveTo?.toISOString().slice(0, 10) ?? null),
    };
  }
  function editor(
    tx: Prisma.TransactionClient,
    audit = new AuditService(primary),
  ) {
    // Only the editor's transaction callback is flattened; SQL/delegates stay real.
    const prisma = {
      $transaction: <T>(
        callback: (client: Prisma.TransactionClient) => Promise<T>,
      ) => {
        requireTestDatabase();
        return callback(tx);
      },
    } as unknown as PrismaService;
    return new PayrollRuleSetDraftEditingService(prisma, audit);
  }
  async function rollback(
    callback: (tx: Prisma.TransactionClient) => Promise<void>,
    client = primary,
  ) {
    requireTestDatabase();
    const sentinel = new Error('private rollback sentinel');
    try {
      await client.$transaction(async (tx) => {
        await callback(tx);
        throw sentinel;
      }, options);
      throw new Error('Rollback transaction unexpectedly committed.');
    } catch (error) {
      if (error !== sentinel) throw error;
    }
  }
  function metadata(row: PayrollRuleSet) {
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      version: row.version,
      schemaVersion: row.schemaVersion,
      draftRevision: row.draftRevision,
      approvedEffectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      approvedEffectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }
  async function assertAudit(
    tx: Prisma.TransactionClient,
    before: PayrollRuleSet,
    after: PayrollRuleSet,
    userId = actors[0],
  ) {
    const rows = await tx.auditLog.findMany({
      where: { entityId: before.id, action: 'EDIT_PAYROLL_RULE_SET_DRAFT' },
    });
    expect(rows).toHaveLength(1);
    const audit = rows[0];
    auditIds.push(audit.id);
    expect(audit).toMatchObject({
      userId,
      companyId: null,
      entity: 'PayrollRuleSet',
      entityId: before.id,
      oldValue: metadata(before),
      newValue: metadata(after),
    });
    expect(audit.oldValue).not.toHaveProperty('rulesPayload');
    expect(audit.newValue).not.toHaveProperty('rulesPayload');
    return audit;
  }
  async function stored(tx: Prisma.TransactionClient, id = ids[0]) {
    return tx.payrollRuleSet.findUniqueOrThrow({ where: { id } });
  }

  it('persists changed content exactly and preserves identity/publication/creation metadata', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx);
      const request = input(before, true);
      const result = await editor(tx).editDraft(request, actors[0]);
      const after = await stored(tx);
      expect(after).toEqual({
        ...before,
        rulesPayload: request.rulesPayload,
        effectiveFrom: new Date('2093-03-01T00:00:00.000Z'),
        effectiveTo: null,
        draftRevision: 2,
        updatedAt: after.updatedAt,
      });
      expect(result).toMatchObject({
        ...metadata(after),
        createdAt: before.createdAt,
        updatedAt: after.updatedAt,
      });
      await assertAudit(tx, before, after);
    });
  });
  it('leaves identical and property-reordered content, dates, revision and historical updatedAt unchanged', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx);
      for (const rulesPayload of [
        before.rulesPayload,
        Object.fromEntries(Object.entries(payload).reverse()),
      ]) {
        await editor(tx).editDraft(
          { ...input(before), rulesPayload },
          actors[0],
        );
        expect(await stored(tx)).toEqual(before);
        expect(await tx.auditLog.count({ where: auditWhere() })).toBe(0);
      }
    });
  });
  it('validates a stale identical request in the same transaction (not committed concurrent-edit proof)', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx);
      await editor(tx).editDraft(input(before, true), actors[0]);
      const after = await stored(tx);
      await expect(
        editor(tx).editDraft(
          { ...input(after), expectedDraftRevision: 1 },
          actors[0],
        ),
      ).rejects.toMatchObject({ code: 'STALE_DRAFT_REVISION' });
      expect(await stored(tx)).toEqual(after);
      await assertAudit(tx, before, after);
    });
  });
  it('treats decimal spelling 1 -> 1.0 as a real change', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx);
      await editor(tx).editDraft(
        { ...input(before), rulesPayload: { ...payload, minimumWage: '1.0' } },
        actors[0],
      );
      const after = await stored(tx);
      expect(after).toEqual({
        ...before,
        rulesPayload: { ...payload, minimumWage: '1.0' },
        draftRevision: 2,
        updatedAt: after.updatedAt,
      });
      await assertAudit(tx, before, after);
    });
  });
  it.each(['missing', 'inactive', 'tenant'] as const)(
    'revalidates real %s actor rows',
    async (kind) => {
      await rollback(async (tx) => {
        if (kind !== 'missing')
          await actor(
            tx,
            actors[0],
            kind === 'tenant' ? UserRole.VIEWER : UserRole.SUPER_ADMIN,
            kind !== 'inactive',
          );
        const before = await draft(tx);
        await expect(
          editor(tx).editDraft(input(before, true), actors[0]),
        ).rejects.toMatchObject({ code: 'PLATFORM_ACTOR_UNAUTHORIZED' });
        expect(await stored(tx)).toEqual(before);
        expect(await tx.auditLog.count({ where: auditWhere() })).toBe(0);
      });
    },
  );
  it('rejects a consistent synthetic PUBLISHED row without mutation or edit audit', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx, 0, 1, true);
      await expect(
        editor(tx).editDraft(input(before, true), actors[0]),
      ).rejects.toMatchObject({ code: 'RULE_SET_NOT_DRAFT' });
      expect(await stored(tx)).toEqual(before);
      expect(await tx.auditLog.count({ where: auditWhere() })).toBe(0);
    });
  });

  function held(
    client: PrismaService,
    callback: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const pid = deferred<number>();
    const ready = deferred<void>();
    const release = deferred<void>();
    let released = false;
    const settled = rollback(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pg_backend_pid() AS pid`;
      pid.resolve(rows[0].pid);
      await callback(tx);
      ready.resolve();
      await bounded(release.promise, 'held transaction release');
    }, client).catch((error: unknown) => {
      pid.reject(error);
      ready.reject(error);
      throw error;
    });
    void settled.catch(() => undefined);
    pending.push(settled);
    return {
      pid: pid.promise,
      ready: ready.promise,
      settled,
      isReleased: () => released,
      release: () => {
        released = true;
        release.resolve();
      },
    };
  }
  async function finishHeld(transactions: ReturnType<typeof held>[]) {
    transactions.forEach((t) => t.release());
    const results = await Promise.allSettled(
      transactions.map((t) => t.settled),
    );
    for (const result of results)
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        throw reason;
      }
  }
  async function observeBlocking(blocked: number, blocker: number) {
    const deadline = Date.now() + waitLimit;
    while (Date.now() < deadline) {
      requireTestDatabase();
      const rows = await bounded(
        observer.$queryRaw<
          Array<{ blockers: number[] }>
        >`SELECT pg_blocking_pids(${blocked}::integer) AS blockers`,
        'blocking query',
      );
      if (rows[0].blockers.includes(blocker)) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(
      'PostgreSQL did not report target transaction A blocking B.',
    );
  }
  it('retains real target FOR UPDATE after catching PUBLISHED rejection inside A', async () => {
    requireTestDatabase();
    const fixture = await observer.payrollRuleSet.findUnique({
      where: { id: E2E_CO_PAYROLL_RULE_SET_ID },
    });
    if (!fixture)
      throw new Error(
        'Required committed synthetic PUBLISHED E2E fixture is missing; this suite never creates it.',
      );
    expect(fixture).toMatchObject(E2E_CO_PAYROLL_RULE_SET_DATA);
    baseline = fixture;
    const rejectPublished = async (
      tx: Prisma.TransactionClient,
      userId: string,
    ) => {
      await actor(tx, userId);
      // Catch INSIDE the held outer transaction so the target row lock survives.
      await expect(
        editor(tx).editDraft(input(fixture), userId),
      ).rejects.toMatchObject({ code: 'RULE_SET_NOT_DRAFT' });
      expect(await tx.auditLog.count({ where: { userId } })).toBe(0);
    };
    const a = held(primary, (tx) => rejectPublished(tx, actors[0]));
    let b: ReturnType<typeof held> | undefined;
    try {
      await bounded(a.ready, 'A rejected and holding target lock');
      b = held(second, (tx) => rejectPublished(tx, actors[1]));
      const aPid = await bounded(a.pid, 'A PID');
      const bPid = await bounded(b.pid, 'B PID');
      expect(aPid).not.toBe(bPid);
      await observeBlocking(bPid, aPid);
      expect(a.isReleased()).toBe(false);
      a.release();
      await bounded(a.settled, 'A rollback');
      await bounded(b.ready, 'B rejection after target lock release');
    } finally {
      await finishHeld([a, ...(b ? [b] : [])]);
    }
    expect(
      await observer.payrollRuleSet.findUnique({ where: { id: fixture.id } }),
    ).toEqual(fixture);
  });
  it('edits and audits a different DRAFT/version before A is released', async () => {
    const edit = async (tx: Prisma.TransactionClient, index: number) => {
      await actor(tx, actors[index]);
      const before = await draft(tx, index);
      await editor(tx).editDraft(input(before, true), actors[index]);
      const after = await stored(tx, ids[index]);
      expect(after.draftRevision).toBe(2);
      await assertAudit(tx, before, after, actors[index]);
    };
    const a = held(primary, (tx) => edit(tx, 0));
    let b: ReturnType<typeof held> | undefined;
    try {
      await bounded(a.ready, 'A edited and held');
      b = held(second, (tx) => edit(tx, 1));
      await bounded(b.ready, 'B edit and audit while A held');
      expect(await bounded(a.pid, 'A PID')).not.toBe(
        await bounded(b.pid, 'B PID'),
      );
      expect(a.isReleased()).toBe(false);
    } finally {
      await finishHeld([a, ...(b ? [b] : [])]);
    }
  });
  it('keeps edited draft and real audit invisible to an independent READ COMMITTED observer', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx);
      await editor(tx).editDraft(input(before, true), actors[0]);
      const after = await stored(tx);
      expect(after.draftRevision).toBe(2);
      const audit = await assertAudit(tx, before, after);
      requireTestDatabase();
      await observer.$transaction(async (outside) => {
        expect(
          await outside.payrollRuleSet.count({ where: { id: before.id } }),
        ).toBe(0);
        expect(await outside.auditLog.count({ where: { id: audit.id } })).toBe(
          0,
        );
      }, options);
    });
    await assertAbsent();
  });
  it('rolls back the real service transaction after a real audit INSERT then controlled failure', async () => {
    const audit = new AuditService(primary);
    const realLog = audit.log.bind(audit) as AuditService['log'];
    const failure = new Error('controlled E2E audit failure');
    let inserted = false;
    const spy = jest
      .spyOn(audit, 'log')
      .mockImplementation(async (data, tx) => {
        if (!tx) throw new Error('Audit transaction client missing.');
        const row = await realLog(data, tx);
        auditIds.push(row.id);
        expect(await tx.auditLog.findUnique({ where: { id: row.id } })).toEqual(
          row,
        );
        expect(
          await tx.payrollRuleSet.findUnique({ where: { id: ids[0] } }),
        ).toMatchObject({
          draftRevision: 2,
          rulesPayload: { ...payload, minimumWage: '23' },
        });
        inserted = true;
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
        return primary.$transaction(
          async (tx) => {
            await actor(tx);
            await draft(tx);
            return callback(tx);
          },
          { ...options, ...transactionOptions },
        );
      },
    } as unknown as PrismaService;
    // No outer rollback sentinel: the controlled audit error must abort the real transaction.
    try {
      const request: EditPayrollRuleSetDraftInput = {
        ruleSetId: ids[0],
        expectedDraftRevision: 1,
        schemaVersion: 1,
        rulesPayload: { ...payload, minimumWage: '23' },
        approvedEffectiveFrom: '2093-03-01',
        approvedEffectiveTo: null,
      };
      let escaped = false;
      try {
        await new PayrollRuleSetDraftEditingService(prisma, audit).editDraft(
          request,
          actors[0],
        );
      } catch (error) {
        if (error !== failure) throw error;
        escaped = true;
      }
      if (!escaped)
        throw new Error(
          'Audit-failure service transaction unexpectedly committed.',
        );
      expect(inserted).toBe(true);
      await assertAbsent();
    } finally {
      spy.mockRestore();
    }
  });
  it('increments to PostgreSQL Int max, rejects the next change, and allows a no-op at max', async () => {
    await rollback(async (tx) => {
      await actor(tx);
      const before = await draft(tx, 0, 2147483646);
      await editor(tx).editDraft(input(before, true), actors[0]);
      const after = await stored(tx);
      expect(after.draftRevision).toBe(2147483647);
      await assertAudit(tx, before, after);
      await expect(
        editor(tx).editDraft(
          { ...input(after), rulesPayload: { ...payload, minimumWage: '29' } },
          actors[0],
        ),
      ).rejects.toMatchObject({ code: 'DRAFT_REVISION_EXHAUSTED' });
      expect(await stored(tx)).toEqual(after);
      await editor(tx).editDraft(input(after), actors[0]);
      expect(await stored(tx)).toEqual(after);
      await assertAudit(tx, before, after);
    });
  });
});
