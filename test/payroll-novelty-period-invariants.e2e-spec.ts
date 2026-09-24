import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_YEAR = 2096;
const TEST_TYPE = 'EXTRAORDINARY' as const;
const TEST_MONTHS = [1, 2, 3, 4] as const;

type JsonObject = Record<string, unknown>;
type SuperTestApp = Parameters<typeof request>[0];

function parseJsonObject(text: string): JsonObject {
  const parsed: unknown = JSON.parse(text);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Se esperaba un objeto JSON en la respuesta E2E');
  }

  return parsed as JsonObject;
}

function readString(body: JsonObject, key: string): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw new Error(`La propiedad ${key} debe ser string`);
  }

  return value;
}

describe('Payroll novelty period invariants (e2e)', () => {
  let app: INestApplication;
  let httpServer: SuperTestApp;
  let prisma: PrismaService;
  let auditService: AuditService;
  let ownerToken: string;
  let companyId: string;
  let employeeId: string;

  const trackedPeriodIds = new Set<string>();
  const trackedNoveltyIds = new Set<string>();
  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const cleanupPeriods = async (periodIds: string[]) => {
    if (periodIds.length === 0) {
      return;
    }

    const items = await prisma.payrollItem.findMany({
      where: { payrollPeriodId: { in: periodIds } },
      select: { id: true },
    });
    const itemIds = items.map((item) => item.id);

    if (itemIds.length > 0) {
      await prisma.payrollConceptDetail.deleteMany({
        where: { payrollItemId: { in: itemIds } },
      });
    }

    await prisma.payrollItem.deleteMany({
      where: { payrollPeriodId: { in: periodIds } },
    });
    await prisma.payrollNovelty.deleteMany({
      where: { payrollPeriodId: { in: periodIds } },
    });
    await prisma.payrollPeriod.deleteMany({
      where: { id: { in: periodIds } },
    });
  };

  const cleanupTrackedEntities = async () => {
    const periodIds = [...trackedPeriodIds];
    const auditEntityIds = [...periodIds, ...trackedNoveltyIds];

    if (auditEntityIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: auditEntityIds } },
      });
    }

    await cleanupPeriods(periodIds);
    trackedPeriodIds.clear();
    trackedNoveltyIds.clear();
  };

  const createPeriod = async (month: number) => {
    const response = await request(httpServer)
      .post('/payroll/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Invariantes novedades E2E ${uniqueSuffix}-${month}`,
        payrollType: TEST_TYPE,
        year: TEST_YEAR,
        month,
      })
      .expect(201);

    const periodId = readString(parseJsonObject(response.text), 'id');
    trackedPeriodIds.add(periodId);
    return periodId;
  };

  const createBonusNovelty = async (periodId: string, description: string) => {
    const response = await request(httpServer)
      .post('/payroll-novelties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId,
        payrollPeriodId: periodId,
        type: 'BONUS',
        amount: 100000,
        description,
      })
      .expect(201);

    const noveltyId = readString(parseJsonObject(response.text), 'id');
    trackedNoveltyIds.add(noveltyId);
    return noveltyId;
  };

  const calculatePeriod = async (periodId: string) => {
    await request(httpServer)
      .post(`/payroll/periods/${periodId}/calculate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
  };

  const getCalculatedSnapshot = async (periodId: string) => {
    const period = await prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { status: true, version: true },
    });
    const items = await prisma.payrollItem.findMany({
      where: { payrollPeriodId: periodId },
      select: { id: true },
    });
    const itemIds = items.map((item) => item.id);
    const conceptCount = await prisma.payrollConceptDetail.count({
      where: { payrollItemId: { in: itemIds } },
    });

    return { period, itemIds, conceptCount };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as SuperTestApp;
    prisma = app.get(PrismaService);
    auditService = app.get(AuditService);

    const loginResponse = await request(httpServer)
      .post('/auth/login')
      .send({ email: 'admin@empresademo.com', password: '12345678' })
      .expect(201);

    ownerToken = readString(parseJsonObject(loginResponse.text), 'accessToken');

    const owner = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@empresademo.com' },
      select: { companyId: true },
    });
    companyId = owner.companyId;

    const employeeResponse = await request(httpServer)
      .post('/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        firstName: 'Invariant',
        lastName: 'Payroll E2E',
        documentType: 'CC',
        documentNumber: `INV-${uniqueSuffix}`,
        email: `payroll-invariant-${uniqueSuffix}@example.com`,
        phone: '3000000001',
        position: 'Empleado de pruebas',
        department: 'E2E',
        contractType: 'INDEFINITE',
        baseSalary: 3000000,
        startDate: '2026-01-01',
      })
      .expect(201);

    employeeId = readString(parseJsonObject(employeeResponse.text), 'id');

    const stalePeriods = await prisma.payrollPeriod.findMany({
      where: {
        companyId,
        year: TEST_YEAR,
        month: { in: [...TEST_MONTHS] },
        payrollType: TEST_TYPE,
      },
      select: { id: true },
    });
    const stalePeriodIds = stalePeriods.map((period) => period.id);

    if (stalePeriodIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: stalePeriodIds } },
      });
      await cleanupPeriods(stalePeriodIds);
    }
  });

  afterEach(async () => {
    await cleanupTrackedEntities();
  });

  afterAll(async () => {
    try {
      await cleanupTrackedEntities();

      if (employeeId) {
        await prisma.auditLog.deleteMany({
          where: { entityId: employeeId },
        });
        await prisma.employee.deleteMany({
          where: { id: employeeId, companyId },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('crear una novedad invalida una liquidación CALCULATED', async () => {
    const month = TEST_MONTHS[0];
    const periodId = await createPeriod(month);
    await createBonusNovelty(periodId, 'Novedad inicial E2E');
    await calculatePeriod(periodId);

    const before = await getCalculatedSnapshot(periodId);
    expect(before.period.status).toBe(PayrollStatus.CALCULATED);
    expect(before.itemIds.length).toBeGreaterThan(0);
    expect(before.conceptCount).toBeGreaterThan(0);

    await createBonusNovelty(periodId, 'Novedad posterior al cálculo E2E');

    const periodAfter = await prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { status: true, version: true },
    });
    const itemCountAfter = await prisma.payrollItem.count({
      where: { payrollPeriodId: periodId },
    });
    const staleConceptCountAfter = await prisma.payrollConceptDetail.count({
      where: { payrollItemId: { in: before.itemIds } },
    });

    expect(periodAfter.status).toBe(PayrollStatus.COLLECTING_NOVELTIES);
    expect(periodAfter.version).toBe(before.period.version + 1);
    expect(itemCountAfter).toBe(0);
    expect(staleConceptCountAfter).toBe(0);
  });

  it('eliminar una novedad invalida una liquidación CALCULATED', async () => {
    const month = TEST_MONTHS[1];
    const periodId = await createPeriod(month);
    const noveltyId = await createBonusNovelty(
      periodId,
      'Novedad a eliminar E2E',
    );
    await calculatePeriod(periodId);

    const before = await getCalculatedSnapshot(periodId);
    expect(before.period.status).toBe(PayrollStatus.CALCULATED);
    expect(before.itemIds.length).toBeGreaterThan(0);

    await request(httpServer)
      .delete(`/payroll-novelties/${noveltyId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const periodAfter = await prisma.payrollPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: { status: true, version: true },
    });
    const itemCountAfter = await prisma.payrollItem.count({
      where: { payrollPeriodId: periodId },
    });
    const staleConceptCountAfter = await prisma.payrollConceptDetail.count({
      where: { payrollItemId: { in: before.itemIds } },
    });
    const deletedNovelty = await prisma.payrollNovelty.findUnique({
      where: { id: noveltyId },
    });

    expect(periodAfter.status).toBe(PayrollStatus.COLLECTING_NOVELTIES);
    expect(periodAfter.version).toBe(before.period.version + 1);
    expect(itemCountAfter).toBe(0);
    expect(staleConceptCountAfter).toBe(0);
    expect(deletedNovelty).toBeNull();
  });

  it('revierte por completo la creación de una novedad si falla su auditoría', async () => {
    const month = TEST_MONTHS[2];
    const periodId = await createPeriod(month);
    await createBonusNovelty(periodId, 'Novedad inicial rollback CREATE');
    await calculatePeriod(periodId);

    const before = await getCalculatedSnapshot(periodId);
    const noveltyCountBefore = await prisma.payrollNovelty.count({
      where: { payrollPeriodId: periodId },
    });
    const prepareAuditCountBefore = await prisma.auditLog.count({
      where: {
        entityId: periodId,
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
      },
    });

    const originalAuditLog = auditService.log.bind(
      auditService,
    ) as AuditService['log'];
    const auditSpy = jest
      .spyOn(auditService, 'log')
      .mockImplementation((data, tx) => {
        if (data.action === 'CREATE_PAYROLL_NOVELTY') {
          throw new Error('E2E forced novelty create audit failure');
        }

        return originalAuditLog(data, tx);
      });

    try {
      await request(httpServer)
        .post('/payroll-novelties')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          employeeId,
          payrollPeriodId: periodId,
          type: 'BONUS',
          amount: 125000,
          description: 'Esta novedad debe hacer rollback',
        })
        .expect(500);
    } finally {
      auditSpy.mockRestore();
    }

    const after = await getCalculatedSnapshot(periodId);
    const noveltyCountAfter = await prisma.payrollNovelty.count({
      where: { payrollPeriodId: periodId },
    });
    const prepareAuditCountAfter = await prisma.auditLog.count({
      where: {
        entityId: periodId,
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
      },
    });

    expect(after.period).toEqual(before.period);
    expect([...after.itemIds].sort()).toEqual([...before.itemIds].sort());
    expect(after.conceptCount).toBe(before.conceptCount);
    expect(noveltyCountAfter).toBe(noveltyCountBefore);
    expect(prepareAuditCountAfter).toBe(prepareAuditCountBefore);
  });

  it('revierte por completo la eliminación de una novedad si falla su auditoría', async () => {
    const month = TEST_MONTHS[3];
    const periodId = await createPeriod(month);
    const noveltyId = await createBonusNovelty(
      periodId,
      'Novedad inicial rollback DELETE',
    );
    await calculatePeriod(periodId);

    const before = await getCalculatedSnapshot(periodId);
    const prepareAuditCountBefore = await prisma.auditLog.count({
      where: {
        entityId: periodId,
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
      },
    });

    const originalAuditLog = auditService.log.bind(
      auditService,
    ) as AuditService['log'];
    const auditSpy = jest
      .spyOn(auditService, 'log')
      .mockImplementation((data, tx) => {
        if (data.action === 'DELETE_PAYROLL_NOVELTY') {
          throw new Error('E2E forced novelty delete audit failure');
        }

        return originalAuditLog(data, tx);
      });

    try {
      await request(httpServer)
        .delete(`/payroll-novelties/${noveltyId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(500);
    } finally {
      auditSpy.mockRestore();
    }

    const after = await getCalculatedSnapshot(periodId);
    const noveltyAfter = await prisma.payrollNovelty.findUnique({
      where: { id: noveltyId },
    });
    const prepareAuditCountAfter = await prisma.auditLog.count({
      where: {
        entityId: periodId,
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
      },
    });

    expect(after.period).toEqual(before.period);
    expect([...after.itemIds].sort()).toEqual([...before.itemIds].sort());
    expect(after.conceptCount).toBe(before.conceptCount);
    expect(noveltyAfter).not.toBeNull();
    expect(prepareAuditCountAfter).toBe(prepareAuditCountBefore);
  });
});
