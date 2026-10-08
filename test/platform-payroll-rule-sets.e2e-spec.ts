import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PayrollRuleSetStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { E2E_CO_PAYROLL_RULE_SET_DATA } from './fixtures/payroll-rule-set.fixture';

interface Metadata {
  id: string;
  jurisdictionCode: string;
  version: number;
  schemaVersion: number;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Inventory {
  data: Metadata[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function requireTestDatabase(): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(process.env.DATABASE_URL ?? '').pathname.slice(1),
    );
  } catch {
    throw new Error('Slice C requires a valid test DATABASE_URL.');
  }
  if (!/(?:^|[_-])(?:test|e2e)(?:[_-]|$)/i.test(databaseName)) {
    throw new Error('Slice C refuses mutations outside a test database.');
  }
}

const prefix = 'e2e-platform-prs-slice-c-';
const companyId = `${prefix}company`;
const companyEmail = `${prefix}company@example.test`;
const nit = 'E2E-PLATFORM-PRS-SLICE-C';
const adminId = `${prefix}super-admin`;
const ownerId = `${prefix}owner`;
const adminEmail = `${prefix}super-admin@example.test`;
const ownerEmail = `${prefix}owner@example.test`;
const drafts = [
  { jurisdictionCode: 'QX', version: 993001, schemaVersion: 1 },
  { jurisdictionCode: 'QX', version: 993003, schemaVersion: 999 },
  { jurisdictionCode: 'QX', version: 993002, schemaVersion: 1 },
  { jurisdictionCode: 'QY', version: 993001, schemaVersion: 1 },
].map((row, index) => ({
  ...row,
  id: `${prefix}${row.jurisdictionCode.toLowerCase()}-${row.version}`,
  status: PayrollRuleSetStatus.DRAFT,
  effectiveFrom: new Date('2097-01-01T00:00:00.000Z'),
  effectiveTo: index === 0 ? new Date('2098-01-01T00:00:00.000Z') : null,
  publishedAt: null,
  rulesPayload: { synthetic: true, purpose: 'slice-c-metadata-only' },
}));
const qxIds = drafts
  .filter((row) => row.jurisdictionCode === 'QX')
  .map((row) => row.id);
const metadataKeys = [
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

function inspectMetadata(items: Metadata[]): void {
  for (const item of items) {
    expect(Object.keys(item).sort()).toEqual(metadataKeys);
    for (const field of [
      'rulesPayload',
      'payrollPeriods',
      'employmentTerminations',
      'active',
      'isActive',
    ]) {
      expect(item).not.toHaveProperty(field);
    }
    expect(item.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (item.effectiveTo !== null) {
      expect(item.effectiveTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  }
}

describe('GET /platform/payroll-rule-sets (real E2E, Slice C)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let server: Server;
  let adminToken: string;
  let forgedToken: string;
  let owned: { drafts: string[]; users: string[]; company: string } | undefined;

  async function inventory(query = ''): Promise<Inventory> {
    const response = await request(server)
      .get(`/platform/payroll-rule-sets${query ? `?${query}` : ''}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const body = response.body as Inventory;
    inspectMetadata(body.data);
    return body;
  }

  async function allFiltered(query: string): Promise<Metadata[]> {
    const first = await inventory(`${query}&page=1&limit=100`);
    const rows = [...first.data];
    for (let page = 2; page <= first.totalPages; page++) {
      rows.push(...(await inventory(`${query}&page=${page}&limit=100`)).data);
    }
    return rows;
  }

  beforeAll(async () => {
    requireTestDatabase();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    prisma = app.get(PrismaService);

    const expected = E2E_CO_PAYROLL_RULE_SET_DATA;
    const published = await prisma.payrollRuleSet.findUnique({
      where: { id: expected.id },
    });
    if (
      !published ||
      published.jurisdictionCode !== expected.jurisdictionCode ||
      published.version !== expected.version ||
      published.schemaVersion !== expected.schemaVersion ||
      published.status !== expected.status ||
      published.effectiveFrom.getTime() !== expected.effectiveFrom.getTime() ||
      published.effectiveTo?.getTime() !== expected.effectiveTo.getTime() ||
      published.publishedAt?.getTime() !== expected.publishedAt.getTime()
    ) {
      throw new Error(
        'Required shared synthetic CO PUBLISHED fixture is missing or its metadata mismatches; no repair attempted.',
      );
    }

    const passwordHash = await bcrypt.hash('synthetic-slice-c-unused-login', 4);
    requireTestDatabase();
    await prisma.$transaction(async (tx) => {
      const companyCollision = await tx.company.count({
        where: { OR: [{ id: companyId }, { nit }, { email: companyEmail }] },
      });
      const userCollision = await tx.user.count({
        where: {
          OR: [
            { id: { in: [adminId, ownerId] } },
            { email: { in: [adminEmail, ownerEmail] } },
          ],
        },
      });
      const draftCollision = await tx.payrollRuleSet.count({
        where: {
          OR: [
            { id: { in: drafts.map((row) => row.id) } },
            { jurisdictionCode: { in: ['QX', 'QY'] } },
          ],
        },
      });
      if (companyCollision || userCollision || draftCollision) {
        throw new Error(
          'Slice C fixture collision: owned identifiers or reserved jurisdictions already exist; nothing deleted or replaced.',
        );
      }
      requireTestDatabase();
      await tx.company.create({
        data: {
          id: companyId,
          name: 'Synthetic Slice C Company',
          nit,
          email: companyEmail,
        },
      });
      requireTestDatabase();
      await tx.user.create({
        data: {
          id: adminId,
          name: 'Synthetic Slice C Admin',
          email: adminEmail,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          companyId: null,
          isActive: true,
        },
      });
      requireTestDatabase();
      await tx.user.create({
        data: {
          id: ownerId,
          name: 'Synthetic Slice C Owner',
          email: ownerEmail,
          passwordHash,
          role: UserRole.OWNER,
          companyId,
          isActive: true,
        },
      });
      for (const data of drafts) {
        requireTestDatabase();
        await tx.payrollRuleSet.create({ data });
      }
    });
    owned = {
      drafts: drafts.map((row) => row.id),
      users: [adminId, ownerId],
      company: companyId,
    };
    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({
      sub: adminId,
      email: adminEmail,
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });
    forgedToken = await jwt.signAsync({
      sub: ownerId,
      email: ownerEmail,
      role: UserRole.SUPER_ADMIN,
      companyId: null,
    });
  }, 30000);

  afterAll(async () => {
    try {
      if (owned) {
        requireTestDatabase();
        await prisma.$transaction(async (tx) => {
          requireTestDatabase();
          const deleted = await tx.payrollRuleSet.deleteMany({
            where: {
              id: { in: owned!.drafts },
              status: PayrollRuleSetStatus.DRAFT,
            },
          });
          if (deleted.count !== owned!.drafts.length)
            throw new Error(
              'Slice C cleanup did not delete every owned DRAFT.',
            );
          requireTestDatabase();
          await tx.user.deleteMany({ where: { id: { in: owned!.users } } });
          requireTestDatabase();
          await tx.company.delete({ where: { id: owned!.company } });
        });
      }
    } finally {
      await app?.close();
    }
  });

  it('rejects a request without Authorization', async () => {
    await request(server).get('/platform/payroll-rule-sets').expect(401);
  });

  it('revalidates a forged platform-looking tenant token against the database', async () => {
    await request(server)
      .get('/platform/payroll-rule-sets')
      .set('Authorization', `Bearer ${forgedToken}`)
      .expect(403);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { role: true, companyId: true, isActive: true },
    });
    expect(owner).toEqual({ role: UserRole.OWNER, companyId, isActive: true });
  });

  it('accepts an active real SUPER_ADMIN and uses controller defaults', async () => {
    const result = await inventory();
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('rejects an already-issued token after database deactivation', async () => {
    try {
      requireTestDatabase();
      await prisma.user.update({
        where: { id: adminId },
        data: { isActive: false },
      });
      await request(server)
        .get('/platform/payroll-rule-sets')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    } finally {
      requireTestDatabase();
      await prisma.user.update({
        where: { id: adminId },
        data: { isActive: true },
      });
    }
  });

  it.each([
    'unknown=value',
    'page=1&page=1',
    'limit=20&limit=20',
    'jurisdictionCode=CO&jurisdictionCode=CO',
    'status=DRAFT&status=DRAFT',
    'page=1.5',
    'limit=1e2',
    'page=',
    'page=0',
    'page=1001',
    'limit=101',
    'jurisdictionCode=co',
    'status=ACTIVE',
  ])('rejects invalid literal HTTP query: %s', async (query) => {
    await request(server)
      .get(`/platform/payroll-rule-sets?${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('filters QX to exactly its three owned drafts', async () => {
    const result = await inventory('jurisdictionCode=QX');
    expect(result.total).toBe(3);
    expect(result.data.map((row) => row.id).sort()).toEqual([...qxIds].sort());
    expect(result.data.every((row) => row.jurisdictionCode === 'QX')).toBe(
      true,
    );
  });

  it('paginates in descending version order and repeats deterministically', async () => {
    const first = await inventory('jurisdictionCode=QX&page=1&limit=2');
    expect(first.data.map((row) => row.version)).toEqual([993003, 993002]);
    const second = await inventory('jurisdictionCode=QX&page=2&limit=2');
    expect(second.page).toBe(2);
    expect(second.limit).toBe(2);
    expect(second.data.map((row) => row.version)).toEqual([993001]);
    expect(
      (await inventory('jurisdictionCode=QX&page=1&limit=2')).data,
    ).toEqual(first.data);
  });

  it('preserves totals for an out-of-range page', async () => {
    const result = await inventory('jurisdictionCode=QX&page=3&limit=2');
    expect(result.data).toEqual([]);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
  });

  it('filters DRAFT across pages without assuming global totals', async () => {
    const rows = await allFiltered('status=DRAFT');
    expect(rows.every((row) => row.status === 'DRAFT')).toBe(true);
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(drafts.map((row) => row.id)),
    );
  });

  it('lists the shared future-effective CO PUBLISHED fixture with both filters', async () => {
    const rows = await allFiltered('jurisdictionCode=CO&status=PUBLISHED');
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every(
        (row) => row.jurisdictionCode === 'CO' && row.status === 'PUBLISHED',
      ),
    ).toBe(true);
    const fixture = rows.find(
      (row) => row.id === E2E_CO_PAYROLL_RULE_SET_DATA.id,
    );
    expect(fixture).toMatchObject({
      effectiveFrom: '2099-01-01',
      effectiveTo: '2100-01-01',
      version: E2E_CO_PAYROLL_RULE_SET_DATA.version,
    });
  });

  it('returns no published rows for QX', async () => {
    const result = await inventory('jurisdictionCode=QX&status=PUBLISHED');
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('exposes metadata only, including unsupported schemas and date-only null boundaries', async () => {
    const rows = (await inventory('jurisdictionCode=QX')).data;
    expect(rows.find((row) => row.version === 993003)).toMatchObject({
      schemaVersion: 999,
      effectiveFrom: '2097-01-01',
      effectiveTo: null,
      publishedAt: null,
    });
    expect(rows.find((row) => row.version === 993001)).toMatchObject({
      effectiveFrom: '2097-01-01',
      effectiveTo: '2098-01-01',
    });
  });
});
