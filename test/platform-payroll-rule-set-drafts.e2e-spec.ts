import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollRuleSet, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  E2E_CO_PAYROLL_RULE_SET_DATA,
  E2E_CO_PAYROLL_RULE_SET_ID,
} from './fixtures/payroll-rule-set.fixture';

// setup-env.ts loads .env.test before this module. Never echo DATABASE_URL.
function requireTestDatabase(): void {
  let url: URL;
  let name: string;
  try {
    url = new URL(process.env.DATABASE_URL ?? '');
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('Draft HTTP E2E requires a valid test DATABASE_URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !name ||
    !/^[a-z0-9_-]+$/i.test(name) ||
    !/(?:^|[_-])(?:test|e2e)(?:[_-]|$)/i.test(name) ||
    /(?:prod|production|live)/i.test(name)
  ) {
    throw new Error(
      'Draft HTTP E2E refuses an ambiguous or non-test database.',
    );
  }
}

let activeTx: Prisma.TransactionClient | undefined;
function requireTx(): Prisma.TransactionClient {
  if (!activeTx) throw new Error('No active rollback-scoped transaction.');
  return activeTx;
}

const transactionAdapter = {
  get user() {
    return requireTx().user;
  },
  get company() {
    return requireTx().company;
  },
  get payrollRuleSet() {
    return requireTx().payrollRuleSet;
  },
  get auditLog() {
    return requireTx().auditLog;
  },
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: unknown[]
  ) {
    return requireTx().$queryRaw<T>(query, ...values);
  },
  $executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) {
    return requireTx().$executeRaw(query, ...values);
  },
  $transaction<T>(
    operation:
      | ((tx: Prisma.TransactionClient) => Promise<T>)
      | Prisma.PrismaPromise<unknown>[],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T | unknown[]> {
    const tx = requireTx();
    if (
      options !== undefined &&
      (options === null ||
        typeof options !== 'object' ||
        Array.isArray(options) ||
        Reflect.ownKeys(options).some((key) => key !== 'isolationLevel') ||
        (options.isolationLevel !== undefined &&
          options.isolationLevel !==
            Prisma.TransactionIsolationLevel.ReadCommitted))
    )
      throw new Error('Unsupported flattened transaction options.');
    // Array promises already belong to activeTx. This opens no nested transaction.
    // Callback flattening has no nested rollback or real service commit boundary.
    return Array.isArray(operation) ? Promise.all(operation) : operation(tx);
  },
};

// Codec-valid synthetic data ONLY; these are NOT legal payroll values.
const payload = {
  minimumWage: '17.00',
  salary: { monthlyDayBasis: 17 },
  standardMonthlyHours: '17.00',
  overtime: { daytimeMultiplier: '1.00', nighttimeMultiplier: '2.00' },
  surcharges: { nighttimeRate: '0.10', sundayHolidayRate: '0.20' },
  contributions: { employeeHealthRate: '0.10', employeePensionRate: '0.20' },
  transportAllowance: {
    monthlyAmount: '17.00',
    salaryLimitInMinimumWages: '2.00',
    monthlyProrationDayBasis: 17,
  },
  severance: { daysPerYear: 17, interestAnnualRate: '0.10' },
  serviceBonus: { daysPerYear: 17 },
  sickLeave: {
    monthlyIbcDayBasis: 17,
    commonDiseaseFirstRangeEndDay: 17,
    commonDiseaseFirstRate: '0.50',
    commonDiseaseSecondRangeEndDay: 34,
    commonDiseaseSecondRate: '0.25',
    workRiskRate: '1.00',
  },
};
const jurisdiction = 'QZ';
const base = '/platform/payroll-rule-sets';
const metadataKeys = [
  'id',
  'jurisdictionCode',
  'version',
  'schemaVersion',
  'draftRevision',
  'approvedEffectiveFrom',
  'approvedEffectiveTo',
  'status',
  'publishedAt',
  'createdAt',
  'updatedAt',
].sort();
interface DraftMetadata {
  id: string;
  jurisdictionCode: string;
  version: number;
  schemaVersion: number;
  draftRevision: number;
  approvedEffectiveFrom: string;
  approvedEffectiveTo: string | null;
  status: string;
  publishedAt: null;
  createdAt: string;
  updatedAt: string;
}
interface Context {
  tx: Prisma.TransactionClient;
  actor: string;
  tenant: string;
  inactive: string;
  company: string;
  token: string;
  ids: string[];
}

describe('Platform payroll rule set drafts (transaction-bound real HTTP)', () => {
  let app: INestApplication | undefined;
  let module: TestingModule | undefined;
  let root: PrismaService | undefined;
  let observer: PrismaService | undefined;
  let server: Server;
  let jwt: JwtService;
  let baseline: PayrollRuleSet | undefined;
  const suite = `e2e-draft-http-${randomUUID()}`;

  async function close(): Promise<void> {
    try {
      if (app) await app.close();
      else await module?.close();
    } finally {
      try {
        await root?.$disconnect();
      } finally {
        await observer?.$disconnect();
      }
    }
  }

  beforeAll(async () => {
    requireTestDatabase();
    if (process.env.NODE_ENV !== 'test')
      throw new Error('Test JWT configuration required.');
    try {
      root = new PrismaService();
      observer = new PrismaService();
      await root.$connect();
      await observer.$connect();
      expect(
        await observer.payrollRuleSet.count({
          where: { jurisdictionCode: jurisdiction },
        }),
      ).toBe(0);
      baseline = await observer.payrollRuleSet.findUniqueOrThrow({
        where: { id: E2E_CO_PAYROLL_RULE_SET_ID },
      });
      expect(baseline).toMatchObject(E2E_CO_PAYROLL_RULE_SET_DATA);
      module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(transactionAdapter)
        .compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      server = app.getHttpServer() as Server;
      jwt = app.get(JwtService);
    } catch (error) {
      await close();
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    try {
      if (baseline && observer) {
        expect(
          await observer.payrollRuleSet.findUnique({
            where: { id: baseline.id },
          }),
        ).toEqual(baseline);
        expect(
          await observer.payrollRuleSet.count({
            where: { jurisdictionCode: jurisdiction },
          }),
        ).toBe(0);
      }
    } finally {
      await close();
    }
  }, 30000);

  async function rollbackTest(
    run: (context: Context) => Promise<void>,
  ): Promise<void> {
    requireTestDatabase();
    if (!root || !observer || activeTx)
      throw new Error('Invalid harness lifecycle.');
    const suffix = `${suite}-${randomUUID()}`;
    const actor = `${suffix}-admin`,
      tenant = `${suffix}-tenant`,
      inactive = `${suffix}-inactive`,
      company = `${suffix}-company`;
    const actors = [actor, tenant, inactive];
    const ids: string[] = [`${suffix}-unsupported`];
    const auditWhere: Prisma.AuditLogWhereInput = {
      OR: [
        { userId: { in: actors } },
        { companyId: company },
        { entityId: { in: ids } },
      ],
    };
    const sentinel = new Error(`Private rollback sentinel: ${suffix}`);
    expect(
      await observer.payrollRuleSet.count({
        where: { jurisdictionCode: jurisdiction },
      }),
    ).toBe(0);
    try {
      try {
        await root.$transaction(
          async (tx) => {
            activeTx = tx;
            await tx.company.create({
              data: {
                id: company,
                name: 'Synthetic HTTP company',
                nit: suffix,
                email: `${company}@example.test`,
              },
            });
            for (const id of actors) {
              await tx.user.create({
                data: {
                  id,
                  name: 'Synthetic HTTP actor',
                  email: `${id}@example.test`,
                  passwordHash: 'synthetic-unused-login-marker',
                  role: id === tenant ? UserRole.OWNER : UserRole.SUPER_ADMIN,
                  companyId: id === tenant ? company : null,
                  isActive: id !== inactive,
                },
              });
            }
            const token = jwt.sign({
              sub: actor,
              email: `${actor}@example.test`,
              role: UserRole.SUPER_ADMIN,
              companyId: null,
            });
            await run({ tx, actor, tenant, inactive, company, token, ids });
            expect(await tx.company.count({ where: { id: company } })).toBe(1);
            expect(
              await observer.company.count({ where: { id: company } }),
            ).toBe(0);
            expect(
              await observer.user.count({ where: { id: { in: actors } } }),
            ).toBe(0);
            expect(
              await observer.payrollRuleSet.count({
                where: {
                  OR: [{ jurisdictionCode: jurisdiction }, { id: { in: ids } }],
                },
              }),
            ).toBe(0);
            expect(await observer.auditLog.count({ where: auditWhere })).toBe(
              0,
            );
            expect(
              await tx.payrollRuleSet.findUnique({
                where: { id: E2E_CO_PAYROLL_RULE_SET_ID },
              }),
            ).toEqual(baseline);
            throw sentinel;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 5000,
            timeout: 45000,
          },
        );
        throw new Error('Rollback transaction unexpectedly committed.');
      } catch (error) {
        if (error !== sentinel) throw error;
      }
    } finally {
      // Clear only after the awaited transaction has settled, also on failures.
      activeTx = undefined;
      expect(
        await observer.payrollRuleSet.count({
          where: {
            OR: [{ jurisdictionCode: jurisdiction }, { id: { in: ids } }],
          },
        }),
      ).toBe(0);
      expect(await observer.auditLog.count({ where: auditWhere })).toBe(0);
      expect(await observer.user.count({ where: { id: { in: actors } } })).toBe(
        0,
      );
      expect(await observer.company.count({ where: { id: company } })).toBe(0);
      expect(
        await observer.payrollRuleSet.findUnique({
          where: { id: E2E_CO_PAYROLL_RULE_SET_ID },
        }),
      ).toEqual(baseline);
    }
  }

  function createBody(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      jurisdictionCode: jurisdiction,
      schemaVersion: 1,
      rulesPayload: payload,
      approvedEffectiveFrom: '2097-01-01',
      approvedEffectiveTo: null,
      ...overrides,
    };
  }
  function editBody(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      expectedDraftRevision: 1,
      schemaVersion: 1,
      rulesPayload: payload,
      approvedEffectiveFrom: '2097-01-01',
      approvedEffectiveTo: null,
      ...overrides,
    };
  }
  function http(
    method: 'get' | 'post' | 'put',
    path: string,
    token?: string,
    body?: Record<string, unknown>,
  ) {
    const call = request(server)[method](path);
    if (token) call.set('Authorization', `Bearer ${token}`);
    if (body) call.send(body);
    return call;
  }
  function inspectMetadata(body: DraftMetadata): void {
    expect(Object.keys(body).sort()).toEqual(metadataKeys);
    expect(body).toMatchObject({
      jurisdictionCode: jurisdiction,
      schemaVersion: 1,
      status: 'DRAFT',
      publishedAt: null,
    });
    for (const timestamp of [body.createdAt, body.updatedAt])
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
  }
  async function create(
    c: Context,
    overrides: Record<string, unknown> = {},
  ): Promise<DraftMetadata> {
    const response = await http(
      'post',
      `${base}/drafts`,
      c.token,
      createBody(overrides),
    ).expect(201);
    const body = response.body as DraftMetadata;
    c.ids.push(body.id);
    inspectMetadata(body);
    expect(response.headers.location).toBe(`${base}/drafts/${body.id}`);
    expect(body.draftRevision).toBe(1);
    expect(body).toMatchObject({
      approvedEffectiveFrom: overrides.approvedEffectiveFrom ?? '2097-01-01',
      approvedEffectiveTo: overrides.approvedEffectiveTo ?? null,
    });
    const row = await c.tx.payrollRuleSet.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(row.rulesPayload).toEqual(payload);
    expect(row.rulesPayload).toHaveProperty('minimumWage', '17.00');
    expect(row.effectiveFrom.toISOString().slice(0, 10)).toBe(
      body.approvedEffectiveFrom,
    );
    expect(row.effectiveTo?.toISOString().slice(0, 10) ?? null).toBe(
      body.approvedEffectiveTo,
    );
    expect(row).toMatchObject({
      status: 'DRAFT',
      draftRevision: 1,
      version: body.version,
    });
    const audits = await c.tx.auditLog.findMany({
      where: { entityId: body.id, action: 'CREATE_PAYROLL_RULE_SET_DRAFT' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      userId: c.actor,
      entity: 'PayrollRuleSet',
    });
    expect(
      await observer!.payrollRuleSet.findUnique({ where: { id: body.id } }),
    ).toBeNull();
    expect(await observer!.auditLog.count({ where: { userId: c.actor } })).toBe(
      0,
    );
    return body;
  }
  function safeError(body: unknown, statusCode: number, code: string): void {
    expect(body).toEqual({
      statusCode,
      code,
      message:
        statusCode === 422
          ? 'Invalid draft content.'
          : statusCode === 404
            ? 'Draft rule set not found.'
            : 'Draft rule set conflict.',
    });
  }

  it('keeps inventory functional and sees HTTP-created uncommitted drafts; reads exact detail', async () => {
    await rollbackTest(async (c) => {
      const inventory = await http('get', base, c.token).expect(200);
      const initial = inventory.body as {
        page: number;
        limit: number;
        data: unknown[];
        total: number;
        totalPages: number;
      };
      expect(Object.keys(initial).sort()).toEqual(
        ['data', 'page', 'limit', 'total', 'totalPages'].sort(),
      );
      expect(initial.page).toBe(1);
      expect(initial.limit).toBe(20);
      expect(Array.isArray(initial.data)).toBe(true);
      expect(Number.isInteger(initial.total)).toBe(true);
      expect(Number.isInteger(initial.totalPages)).toBe(true);
      const first = await create(c);
      const second = await create(c, { approvedEffectiveTo: '2098-01-01' });
      expect(second.version).toBe(first.version + 1);
      const filtered = await http(
        'get',
        `${base}?jurisdictionCode=${jurisdiction}&status=DRAFT`,
        c.token,
      ).expect(200);
      const list = filtered.body as {
        data: Record<string, unknown>[];
        total: number;
      };
      expect(list.total).toBe(2);
      expect(list.data.map((row) => row.id).sort()).toEqual(
        [first.id, second.id].sort(),
      );
      const inventoryKeys = [
        'id',
        'jurisdictionCode',
        'version',
        'schemaVersion',
        'status',
        'effectiveFrom',
        'effectiveTo',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ].sort();
      for (const row of list.data)
        expect(Object.keys(row).sort()).toEqual(inventoryKeys);
      for (const draft of [first, second]) {
        const detail = await http(
          'get',
          `${base}/drafts/${draft.id}`,
          c.token,
        ).expect(200);
        expect(Object.keys(detail.body as object).sort()).toEqual(
          [...metadataKeys, 'rulesPayload'].sort(),
        );
        expect(detail.body as unknown).toEqual({
          ...draft,
          rulesPayload: payload,
        });
      }
    });
  }, 60000);

  it('verifies JWT signatures and DB-backed platform authority across draft endpoints', async () => {
    await rollbackTest(async (c) => {
      const draft = await create(c);
      const claims = (
        sub: string,
        role = UserRole.SUPER_ADMIN,
        companyId: string | null = null,
      ) => ({ sub, email: `${sub}@example.test`, role, companyId });
      // A genuinely different signing key; neither signing secret is printed.
      const invalid = new JwtService({
        secret: `test-only-invalid-signature-${randomUUID()}`,
      }).sign(claims(c.actor));
      const denied = [
        jwt.sign(claims(c.tenant, UserRole.OWNER, c.company)),
        jwt.sign(claims(c.tenant)),
        jwt.sign(claims(c.inactive)),
        jwt.sign(claims(`${suite}-nonexistent`)),
      ];
      for (const method of ['post', 'get', 'put'] as const) {
        const path =
          method === 'post' ? `${base}/drafts` : `${base}/drafts/${draft.id}`;
        const body =
          method === 'post'
            ? createBody()
            : method === 'put'
              ? editBody()
              : undefined;
        await http(method, path, undefined, body).expect(401);
        await http(method, path, invalid, body).expect(401);
        for (const token of denied)
          await http(method, path, token, body).expect(403);
      }
      await c.tx.user.update({
        where: { id: c.actor },
        data: { role: UserRole.OWNER, companyId: c.company },
      });
      for (const method of ['post', 'get', 'put'] as const)
        await http(
          method,
          method === 'post' ? `${base}/drafts` : `${base}/drafts/${draft.id}`,
          c.token,
          method === 'post'
            ? createBody()
            : method === 'put'
              ? editBody()
              : undefined,
        ).expect(403);
      // Malformed identities are rejected by PlatformScopeGuard; no claim that
      // controller INVALID_ACTOR_USER_ID is normally reachable through HTTP.
    });
  }, 60000);

  it('rejects POST transport fields and semantic content through real HTTP validation', async () => {
    await rollbackTest(async (c) => {
      for (const field of [
        'actorUserId',
        'userId',
        'role',
        'companyId',
        'status',
        'version',
        'draftRevision',
        'publishedAt',
        'id',
        'createdAt',
        'updatedAt',
      ])
        await http(
          'post',
          `${base}/drafts`,
          c.token,
          createBody({ [field]: 'unexpected' }),
        ).expect(400);
      const omitted = createBody();
      delete omitted.approvedEffectiveTo;
      const invalidBodies = [
        omitted,
        createBody({ schemaVersion: '1' }),
        createBody({ jurisdictionCode: 'qz' }),
        createBody({ rulesPayload: null }),
        createBody({ rulesPayload: [] }),
        createBody({ approvedEffectiveFrom: '2097/01/01' }),
        createBody({ approvedEffectiveTo: 'tomorrow' }),
      ];
      for (const body of invalidBodies)
        await http('post', `${base}/drafts`, c.token, body).expect(400);
      for (const [overrides, code] of semanticCases) {
        const response = await http(
          'post',
          `${base}/drafts`,
          c.token,
          createBody(overrides),
        ).expect(422);
        safeError(response.body, 422, code);
      }
      expect(
        await c.tx.payrollRuleSet.count({
          where: { jurisdictionCode: jurisdiction },
        }),
      ).toBe(0);
      expect(await c.tx.auditLog.count({ where: { userId: c.actor } })).toBe(0);
    });
  }, 60000);

  const semanticCases: [Record<string, unknown>, string][] = [
    [{ rulesPayload: { synthetic: true } }, 'INVALID_RULES_PAYLOAD'],
    [{ schemaVersion: 999 }, 'INVALID_RULES_PAYLOAD'],
    [{ approvedEffectiveFrom: '2097-02-29' }, 'INVALID_BUSINESS_DATE'],
    [
      { approvedEffectiveTo: '2096-01-01' },
      'INVALID_APPROVED_TEMPORAL_ENVELOPE',
    ],
    [
      { approvedEffectiveTo: '2097-01-01' },
      'INVALID_APPROVED_TEMPORAL_ENVELOPE',
    ],
  ];

  it('reads unsupported persisted schema without codec rewriting and maps detail failures', async () => {
    await rollbackTest(async (c) => {
      // HTTP cannot create an unsupported schema; direct insertion is confined
      // to this read-only compatibility fixture, still inside the rollback.
      const unknownPayload = {
        synthetic: '17.00',
        futureSchema: { untouched: true },
      };
      await c.tx.payrollRuleSet.create({
        data: {
          id: c.ids[0],
          jurisdictionCode: jurisdiction,
          version: 1,
          schemaVersion: 999,
          draftRevision: 1,
          status: 'DRAFT',
          effectiveFrom: new Date('2097-01-01T00:00:00.000Z'),
          effectiveTo: null,
          publishedAt: null,
          rulesPayload: unknownPayload,
        },
      });
      const response = await http(
        'get',
        `${base}/drafts/${c.ids[0]}`,
        c.token,
      ).expect(200);
      expect(Object.keys(response.body as object).sort()).toEqual(
        [...metadataKeys, 'rulesPayload'].sort(),
      );
      expect(response.body as unknown).toMatchObject({
        schemaVersion: 999,
        rulesPayload: unknownPayload,
        draftRevision: 1,
        status: 'DRAFT',
        publishedAt: null,
      });
      const missing = await http(
        'get',
        `${base}/drafts/${suite}-non-uuid-missing`,
        c.token,
      ).expect(404);
      safeError(missing.body, 404, 'RULE_SET_NOT_FOUND');
      const published = await http(
        'get',
        `${base}/drafts/${E2E_CO_PAYROLL_RULE_SET_ID}`,
        c.token,
      ).expect(409);
      safeError(published.body, 409, 'RULE_SET_NOT_DRAFT');
      await http('get', `${base}/drafts/%20%20`, c.token).expect(400);
      await http('get', `${base}/drafts`, c.token).expect(404); // routing, not blank-id DTO validation
    });
  }, 60000);

  it('edits the route target, preserves no-op state and rejects stale revisions', async () => {
    await rollbackTest(async (c) => {
      const draft = await create(c);
      const untouched = await create(c);
      const original = await c.tx.payrollRuleSet.findUniqueOrThrow({
        where: { id: draft.id },
      });
      const noOp = await http(
        'put',
        `${base}/drafts/${draft.id}`,
        c.token,
        editBody(),
      ).expect(200);
      expect(noOp.body as unknown).toEqual(draft);
      expect(
        await c.tx.payrollRuleSet.findUnique({ where: { id: draft.id } }),
      ).toEqual(original);
      expect(
        await c.tx.auditLog.count({
          where: { entityId: draft.id, action: 'EDIT_PAYROLL_RULE_SET_DRAFT' },
        }),
      ).toBe(0);
      const changedPayload = { ...payload, minimumWage: '19.00' };
      const edit = editBody({
        rulesPayload: changedPayload,
        approvedEffectiveFrom: '2097-02-01',
        approvedEffectiveTo: '2098-02-01',
      });
      const response = await http(
        'put',
        `${base}/drafts/${draft.id}`,
        c.token,
        edit,
      ).expect(200);
      const result = response.body as DraftMetadata;
      inspectMetadata(result);
      expect(result).toMatchObject({
        id: draft.id,
        version: draft.version,
        draftRevision: 2,
        approvedEffectiveFrom: '2097-02-01',
        approvedEffectiveTo: '2098-02-01',
      });
      const saved = await c.tx.payrollRuleSet.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(saved).toMatchObject({
        draftRevision: 2,
        rulesPayload: changedPayload,
        effectiveFrom: new Date('2097-02-01T00:00:00.000Z'),
        effectiveTo: new Date('2098-02-01T00:00:00.000Z'),
      });
      expect(
        await c.tx.payrollRuleSet.findUnique({ where: { id: untouched.id } }),
      ).toMatchObject({ draftRevision: 1, rulesPayload: payload });
      const audits = await c.tx.auditLog.findMany({
        where: { entityId: draft.id, action: 'EDIT_PAYROLL_RULE_SET_DRAFT' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ userId: c.actor, entityId: draft.id });
      for (const body of [
        edit,
        editBody({ rulesPayload: { ...payload, minimumWage: '21.00' } }),
      ]) {
        const stale = await http(
          'put',
          `${base}/drafts/${draft.id}`,
          c.token,
          body,
        ).expect(409);
        safeError(stale.body, 409, 'STALE_DRAFT_REVISION');
      }
      expect(
        await c.tx.payrollRuleSet.findUnique({ where: { id: draft.id } }),
      ).toEqual(saved);
      expect(
        await c.tx.auditLog.count({
          where: { entityId: draft.id, action: 'EDIT_PAYROLL_RULE_SET_DRAFT' },
        }),
      ).toBe(1);
      expect(
        await observer!.payrollRuleSet.findUnique({ where: { id: draft.id } }),
      ).toBeNull();
      expect(
        await observer!.auditLog.count({ where: { userId: c.actor } }),
      ).toBe(0);
      // Success through transformed HTTP DTOs proves controller reconstruction
      // reaches the strict plain-object editing service without mocking it.
    });
  }, 60000);

  it('rejects PUT transport and semantic changes and leaves committed PUBLISHED fixture intact', async () => {
    await rollbackTest(async (c) => {
      const draft = await create(c);
      const original = await c.tx.payrollRuleSet.findUniqueOrThrow({
        where: { id: draft.id },
      });
      for (const field of [
        'ruleSetId',
        'jurisdictionCode',
        'actorUserId',
        'userId',
        'role',
        'companyId',
        'status',
        'version',
        'draftRevision',
        'publishedAt',
        'id',
        'createdAt',
        'updatedAt',
      ])
        await http(
          'put',
          `${base}/drafts/${draft.id}`,
          c.token,
          editBody({
            [field]:
              field === 'ruleSetId' ? E2E_CO_PAYROLL_RULE_SET_ID : 'unexpected',
          }),
        ).expect(400);
      await http(
        'put',
        `${base}/drafts/${draft.id}`,
        c.token,
        editBody({ expectedDraftRevision: '1' }),
      ).expect(400);
      for (const [overrides, code] of semanticCases) {
        const response = await http(
          'put',
          `${base}/drafts/${draft.id}`,
          c.token,
          editBody(overrides),
        ).expect(422);
        safeError(response.body, 422, code);
      }
      const published = await http(
        'put',
        `${base}/drafts/${E2E_CO_PAYROLL_RULE_SET_ID}`,
        c.token,
        editBody(),
      ).expect(409);
      safeError(published.body, 409, 'RULE_SET_NOT_DRAFT');
      expect(
        await c.tx.payrollRuleSet.findUnique({ where: { id: draft.id } }),
      ).toEqual(original);
      expect(
        await c.tx.auditLog.count({
          where: { userId: c.actor, action: 'EDIT_PAYROLL_RULE_SET_DRAFT' },
        }),
      ).toBe(0);
    });
  }, 60000);
});
