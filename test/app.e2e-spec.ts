import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Nomina360 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let auditService: AuditService;

  let createdUserId: string | undefined;
  let createdEmployeeId: string | undefined;
  let createdPayrollPeriodId: string | undefined;
  let createdNoveltyId: string | undefined;
  let terminationEmployeeId: string | undefined;
  let employmentTerminationId: string | undefined;
  let rollbackFirstPeriodId: string | undefined;
  let rollbackRecalculationPeriodId: string | undefined;
  let lifecyclePayrollPeriodId: string | undefined;

  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const testUserEmail = `usuario-e2e-${uniqueSuffix}@nomina360.test`;
  const testEmployeeEmail = `empleado-e2e-${uniqueSuffix}@nomina360.test`;
  const testDocumentNumber = `E2E${Date.now()}`;

  const terminationEmployeeEmail = `terminacion-e2e-${uniqueSuffix}@nomina360.test`;

  const terminationDocumentNumber = `TERM${Date.now()}`;

  const testPayrollYear = 2099;
  const testPayrollMonth = 12;
  const rollbackPayrollYear = 2099;
  const rollbackFirstMonth = 10;
  const rollbackRecalculationMonth = 11;
  const rollbackPayrollType = 'EXTRAORDINARY' as const;
  const lifecyclePayrollYear = 2099;
  const lifecyclePayrollMonth = 9;
  const lifecyclePayrollType = 'EXTRAORDINARY' as const;

  const getPayrollSnapshot = async (periodId: string) => {
  const period = await prisma.payrollPeriod.findUniqueOrThrow({
    where: {
      id: periodId,
    },
    select: {
      status: true,
      version: true,
      approvedAt: true,
      approvedById: true,
      closedAt: true,
      closedById: true,
    },
  });

  const items = await prisma.payrollItem.findMany({
    where: {
      payrollPeriodId: periodId,
    },
    orderBy: {
      id: 'asc',
    },
    select: {
      id: true,
      employeeId: true,
      baseSalary: true,
      earnedTotal: true,
      deductionsTotal: true,
      netPay: true,
    },
  });

  const itemIds = items.map((item) => item.id);

  const concepts =
    itemIds.length > 0
      ? await prisma.payrollConceptDetail.findMany({
          where: {
            payrollItemId: {
              in: itemIds,
            },
          },
          orderBy: {
            id: 'asc',
          },
          select: {
            id: true,
            payrollItemId: true,
            conceptCode: true,
            conceptName: true,
            type: true,
            amount: true,
          },
        })
      : [];

  return {
    status: period.status,
    version: period.version,
    approvedAt: period.approvedAt,
    approvedById: period.approvedById,
    closedAt: period.closedAt,
    closedById: period.closedById,
    items: items.map((item) => ({
      ...item,
      baseSalary: item.baseSalary.toString(),
      earnedTotal: item.earnedTotal.toString(),
      deductionsTotal: item.deductionsTotal.toString(),
      netPay: item.netPay.toString(),
    })),
    concepts: concepts.map((concept) => ({
      ...concept,
      amount: concept.amount.toString(),
    })),
  };
};

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    auditService = app.get(AuditService);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@empresademo.com',
        password: '12345678',
      })
      .expect(201);

    ownerToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    if (employmentTerminationId) {
      await prisma.employmentTermination.deleteMany({
        where: {
          id: employmentTerminationId,
        },
      });
    }

    if (terminationEmployeeId) {
      await prisma.employee.deleteMany({
        where: {
          id: terminationEmployeeId,
        },
      });
    }
    try {
      const rollbackPeriodIds = [
  rollbackFirstPeriodId,
  rollbackRecalculationPeriodId,
  lifecyclePayrollPeriodId,
].filter((id): id is string => Boolean(id));

if (rollbackPeriodIds.length > 0) {
  const rollbackItems = await prisma.payrollItem.findMany({
    where: {
      payrollPeriodId: {
        in: rollbackPeriodIds,
      },
    },
    select: {
      id: true,
    },
  });

  const rollbackItemIds = rollbackItems.map((item) => item.id);

  if (rollbackItemIds.length > 0) {
    await prisma.payrollConceptDetail.deleteMany({
      where: {
        payrollItemId: {
          in: rollbackItemIds,
        },
      },
    });
  }

  await prisma.payrollItem.deleteMany({
    where: {
      payrollPeriodId: {
        in: rollbackPeriodIds,
      },
    },
  });

  await prisma.payrollPeriod.deleteMany({
    where: {
      id: {
        in: rollbackPeriodIds,
      },
    },
  });
}
      if (createdNoveltyId) {
        await prisma.payrollNovelty.deleteMany({
          where: {
            id: createdNoveltyId,
          },
        });
      }

      if (createdPayrollPeriodId) {
        await prisma.payrollPeriod.deleteMany({
          where: {
            id: createdPayrollPeriodId,
          },
        });
      }

      if (createdEmployeeId) {
        await prisma.employee.deleteMany({
          where: {
            id: createdEmployeeId,
          },
        });
      }

      if (createdUserId) {
        await prisma.user.deleteMany({
          where: {
            id: createdUserId,
          },
        });
      }

      const entityIds = [
        createdUserId,
        createdEmployeeId,
        createdPayrollPeriodId,
        createdNoveltyId,
        terminationEmployeeId,
        employmentTerminationId,
        rollbackFirstPeriodId,
        rollbackRecalculationPeriodId,
      ].filter((id): id is string => Boolean(id));

      if (entityIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: {
            entityId: {
              in: entityIds,
            },
          },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('GET / debe responder 200', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('GET /users sin token debe responder 401', async () => {
    await request(app.getHttpServer()).get('/users').expect(401);
  });

  it('POST /auth/login debe devolver un accessToken', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@empresademo.com',
        password: '12345678',
      })
      .expect(201);

    expect(response.body).toHaveProperty('accessToken');
    expect(typeof response.body.accessToken).toBe('string');
    expect(response.body.accessToken.length).toBeGreaterThan(20);
  });

  it('POST /auth/login con contraseña incorrecta debe responder 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@empresademo.com',
        password: 'clave-incorrecta',
      })
      .expect(401);
  });

  it('GET /users con token OWNER debe responder 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/users?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 10);
    expect(response.body).toHaveProperty('total');
    expect(response.body).toHaveProperty('totalPages');
  });

  it('GET /users con page inválido debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/users?page=abc')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain(
      'page debe ser un número entero mayor o igual a 1',
    );
  });

  it('GET /users con limit superior a 100 debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/users?limit=500')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain('limit no puede ser mayor que 100');
  });

  it('GET /employees debe responder 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/employees?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 10);
  });

  it('GET /employees con page inválido debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/employees?page=abc')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain(
      'page debe ser un número entero mayor o igual a 1',
    );
  });

  it('GET /payroll-novelties debe responder 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/payroll-novelties?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 10);
  });

  it('GET /payroll-novelties con month inválido debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/payroll-novelties?month=20')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain(
      'month debe ser un número entero entre 1 y 12',
    );
  });

  it('GET /payroll debe responder 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/payroll?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 10);
  });

  it('GET /payroll con status inválido debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/payroll?status=INVALID_STATUS')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain('Estado de nómina no válido');
  });

  it('GET /audit debe responder 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit?page=1&limit=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('limit', 10);
  });

  it('GET /audit con limit superior a 100 debe responder 400', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit?limit=500')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain('limit no puede ser mayor que 100');
  });

  it('POST /users debe crear un usuario', async () => {
    const response = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Usuario E2E',
        email: testUserEmail,
        password: '12345678',
        role: 'VIEWER',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.email).toBe(testUserEmail);
    expect(response.body.role).toBe('VIEWER');
    expect(response.body.isActive).toBe(true);
    expect(response.body).not.toHaveProperty('passwordHash');

    createdUserId = response.body.id;
  });

  it('GET /users debe encontrar el usuario creado', async () => {
    const response = await request(app.getHttpServer())
      .get(`/users?search=${encodeURIComponent(testUserEmail)}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.total).toBeGreaterThanOrEqual(1);

    const createdUser = response.body.data.find(
      (user: { id: string }) => user.id === createdUserId,
    );

    expect(createdUser).toBeDefined();
    expect(createdUser.email).toBe(testUserEmail);
  });

  it('GET /audit debe registrar CREATE_USER', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit?action=CREATE_USER&entity=User&page=1&limit=100')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) => record.entityId === createdUserId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CREATE_USER');
    expect(auditRecord.entity).toBe('User');
  });

  it('POST /employees debe crear un colaborador', async () => {
    const response = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        firstName: 'Carlos',
        lastName: 'Prueba E2E',
        documentType: 'CC',
        documentNumber: testDocumentNumber,
        email: testEmployeeEmail,
        phone: '3001234567',
        position: 'Auxiliar de pruebas',
        department: 'Tecnología',
        contractType: 'INDEFINITE',
        baseSalary: 1800000,
        startDate: '2026-01-15',
        eps: 'Sura',
        pensionFund: 'Protección',
        arl: 'Positiva',
        compensationBox: 'Comfama',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.documentNumber).toBe(testDocumentNumber);
    expect(response.body.email).toBe(testEmployeeEmail);
    expect(response.body.status).toBe('ACTIVE');

    createdEmployeeId = response.body.id;
  });

  it('GET /employees debe encontrar el colaborador creado', async () => {
    const response = await request(app.getHttpServer())
      .get(`/employees?search=${testDocumentNumber}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const employee = response.body.data.find(
      (item: { id: string }) => item.id === createdEmployeeId,
    );

    expect(employee).toBeDefined();
    expect(employee.documentNumber).toBe(testDocumentNumber);
  });

  it('GET /audit debe registrar CREATE_EMPLOYEE', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit?action=CREATE_EMPLOYEE&entity=Employee&page=1&limit=100')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) => record.entityId === createdEmployeeId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CREATE_EMPLOYEE');
  });

  it('POST /payroll/periods debe crear un período de nómina', async () => {
    const response = await request(app.getHttpServer())
      .post('/payroll/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Período automático E2E ${uniqueSuffix}`,
        payrollType: 'EXTRAORDINARY',
        year: testPayrollYear,
        month: testPayrollMonth,
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.year).toBe(testPayrollYear);
    expect(response.body.month).toBe(testPayrollMonth);
    expect(response.body.payrollType).toBe('EXTRAORDINARY');

    createdPayrollPeriodId = response.body.id;
  });

  it('POST /payroll-novelties debe crear una novedad', async () => {
    const response = await request(app.getHttpServer())
      .post('/payroll-novelties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: createdEmployeeId,
        payrollPeriodId: createdPayrollPeriodId,
        type: 'BONUS',
        amount: 150000,
        description: 'Bonificación automática E2E',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.employeeId).toBe(createdEmployeeId);
    expect(response.body.payrollPeriodId).toBe(createdPayrollPeriodId);
    expect(response.body.type).toBe('BONUS');

    createdNoveltyId = response.body.id;
  });

  it('GET /payroll-novelties debe encontrar la novedad creada', async () => {
    const search = encodeURIComponent('Bonificación');

    const response = await request(app.getHttpServer())
      .get(
        `/payroll-novelties?year=${testPayrollYear}&month=${testPayrollMonth}&search=${search}&page=1&limit=20`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const novelty = response.body.data.find(
      (item: { id: string }) => item.id === createdNoveltyId,
    );

    expect(novelty).toBeDefined();
    expect(novelty.description).toBe('Bonificación automática E2E');
  });

  it('GET /audit debe registrar CREATE_PAYROLL_NOVELTY', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/audit?action=CREATE_PAYROLL_NOVELTY&entity=PayrollNovelty&page=1&limit=100',
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) => record.entityId === createdNoveltyId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CREATE_PAYROLL_NOVELTY');
  });

  it('POST /payroll/calculate debe persistir aritmética Decimal exacta sin ruido IEEE-754', async () => {
  let precisionPeriodId: string | undefined;
  let precisionNoveltyId: string | undefined;

  const precisionPayrollYear = 2098;
  const precisionPayrollMonth = 8;
  const precisionPayrollType = 'EXTRAORDINARY' as const;

  try {
    const periodResponse = await request(app.getHttpServer())
      .post('/payroll/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Precisión Decimal E2E ${uniqueSuffix}`,
        payrollType: precisionPayrollType,
        year: precisionPayrollYear,
        month: precisionPayrollMonth,
      })
      .expect(201);

    precisionPeriodId = periodResponse.body.id;

    const noveltyResponse = await request(app.getHttpServer())
      .post('/payroll-novelties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: createdEmployeeId,
        payrollPeriodId: precisionPeriodId,
        type: 'LEAVE',
        leaveType: 'UNPAID',
        quantity: 3,
        description: 'Licencia no remunerada precisión Decimal E2E',
      })
      .expect(201);

    precisionNoveltyId = noveltyResponse.body.id;

    await request(app.getHttpServer())
      .post('/payroll/calculate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        year: precisionPayrollYear,
        month: precisionPayrollMonth,
        payrollType: precisionPayrollType,
      })
      .expect(201);

    const payrollItem = await prisma.payrollItem.findFirstOrThrow({
      where: {
        payrollPeriodId: precisionPeriodId,
        employeeId: createdEmployeeId,
      },
      select: {
        id: true,
        baseSalary: true,
        earnedTotal: true,
        deductionsTotal: true,
        netPay: true,
      },
    });

    const baseSalaryConcept =
      await prisma.payrollConceptDetail.findFirstOrThrow({
        where: {
          payrollItemId: payrollItem.id,
          conceptCode: 'BASE_SALARY',
        },
        select: {
          amount: true,
        },
      });

    const transportAllowanceConcept =
      await prisma.payrollConceptDetail.findFirstOrThrow({
        where: {
          payrollItemId: payrollItem.id,
          conceptCode: 'TRANSPORT_ALLOWANCE',
        },
        select: {
          amount: true,
        },
      });

    /*
     * El colaborador E2E gana $1.800.000 y tiene 3 días de licencia
     * no remunerada:
     *
     * salario ordinario = 1.800.000 / 30 * 27 = 1.620.000
     *
     * auxilio transporte exacto:
     * 249.095 / 30 * 27 = 224.185,5
     * ROUND_HALF_UP = 224.186
     *
     * Con Number + Math.round la representación IEEE-754 anterior podía
     * producir 224185.49999999997 y terminar incorrectamente en 224.185.
     */
    expect(payrollItem.baseSalary.toString()).toBe('1800000');

    expect(baseSalaryConcept.amount.toString()).toBe('1620000');

    expect(transportAllowanceConcept.amount.toString()).toBe('224186');

    expect(payrollItem.earnedTotal.toString()).toBe('1844186');

    expect(payrollItem.deductionsTotal.toString()).toBe('129600');

    expect(payrollItem.netPay.toString()).toBe('1714586');
  } finally {
    const auditEntityIds = [
      precisionPeriodId,
      precisionNoveltyId,
    ].filter((id): id is string => Boolean(id));

    if (auditEntityIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entityId: {
            in: auditEntityIds,
          },
        },
      });
    }

    if (precisionPeriodId) {
      const items = await prisma.payrollItem.findMany({
        where: {
          payrollPeriodId: precisionPeriodId,
        },
        select: {
          id: true,
        },
      });

      const itemIds = items.map((item) => item.id);

      if (itemIds.length > 0) {
        await prisma.payrollConceptDetail.deleteMany({
          where: {
            payrollItemId: {
              in: itemIds,
            },
          },
        });
      }

      await prisma.payrollItem.deleteMany({
        where: {
          payrollPeriodId: precisionPeriodId,
        },
      });

      await prisma.payrollNovelty.deleteMany({
        where: {
          payrollPeriodId: precisionPeriodId,
        },
      });

      await prisma.payrollPeriod.deleteMany({
        where: {
          id: precisionPeriodId,
        },
      });
    }
  }
});

  it('POST /payroll/calculate debe hacer rollback real si falla el audit en un primer cálculo', async () => {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: {
      id: createdEmployeeId,
    },
    select: {
      companyId: true,
    },
  });

  const auditSpy = jest
    .spyOn(auditService, 'log')
    .mockRejectedValueOnce(new Error('E2E forced audit failure'));

  try {
    await request(app.getHttpServer())
      .post('/payroll/calculate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        year: rollbackPayrollYear,
        month: rollbackFirstMonth,
        payrollType: rollbackPayrollType,
      })
      .expect(500);
  } finally {
    auditSpy.mockRestore();
  }

  const period = await prisma.payrollPeriod.findFirstOrThrow({
    where: {
      companyId: employee.companyId,
      year: rollbackPayrollYear,
      month: rollbackFirstMonth,
      payrollType: rollbackPayrollType,
    },
  });

  rollbackFirstPeriodId = period.id;

  expect(period.status).toBe('DRAFT');

  const items = await prisma.payrollItem.findMany({
    where: {
      payrollPeriodId: period.id,
    },
    select: {
      id: true,
    },
  });

  expect(items).toHaveLength(0);

  const conceptCount = await prisma.payrollConceptDetail.count({
    where: {
      payrollItemId: {
        in: items.map((item) => item.id),
      },
    },
  });

  expect(conceptCount).toBe(0);

  const auditCount = await prisma.auditLog.count({
    where: {
      entity: 'PayrollPeriod',
      entityId: period.id,
      action: 'CALCULATE_PAYROLL',
    },
  });

  expect(auditCount).toBe(0);
});

it('POST /payroll/calculate debe restaurar la liquidación anterior si falla una recalculación', async () => {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: {
      id: createdEmployeeId,
    },
    select: {
      companyId: true,
    },
  });

  await request(app.getHttpServer())
    .post('/payroll/calculate')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({
      year: rollbackPayrollYear,
      month: rollbackRecalculationMonth,
      payrollType: rollbackPayrollType,
    })
    .expect(201);

  const period = await prisma.payrollPeriod.findFirstOrThrow({
    where: {
      companyId: employee.companyId,
      year: rollbackPayrollYear,
      month: rollbackRecalculationMonth,
      payrollType: rollbackPayrollType,
    },
  });

  rollbackRecalculationPeriodId = period.id;

  const before = await getPayrollSnapshot(period.id);

  expect(before.status).toBe('CALCULATED');
  expect(before.items.length).toBeGreaterThan(0);

  const auditCountBefore = await prisma.auditLog.count({
    where: {
      entity: 'PayrollPeriod',
      entityId: period.id,
      action: 'CALCULATE_PAYROLL',
    },
  });

  expect(auditCountBefore).toBeGreaterThan(0);

  const auditSpy = jest
    .spyOn(auditService, 'log')
    .mockRejectedValueOnce(new Error('E2E forced audit failure'));

  try {
    await request(app.getHttpServer())
      .post('/payroll/calculate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        year: rollbackPayrollYear,
        month: rollbackRecalculationMonth,
        payrollType: rollbackPayrollType,
      })
      .expect(500);
  } finally {
    auditSpy.mockRestore();
  }

  const after = await getPayrollSnapshot(period.id);

  expect(after).toEqual(before);

  const auditCountAfter = await prisma.auditLog.count({
    where: {
      entity: 'PayrollPeriod',
      entityId: period.id,
      action: 'CALCULATE_PAYROLL',
    },
  });

  expect(auditCountAfter).toBe(auditCountBefore);
});

  it('debe proteger el lifecycle de nómina con versionado, concurrencia y rollback atómico', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/payroll/periods')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Lifecycle E2E ${uniqueSuffix}`,
        payrollType: lifecyclePayrollType,
        year: lifecyclePayrollYear,
        month: lifecyclePayrollMonth,
      })
      .expect(201);

    lifecyclePayrollPeriodId = createResponse.body.id;

    const draftPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(draftPeriod.status).toBe('DRAFT');
    expect(draftPeriod.version).toBe(0);

    await request(app.getHttpServer())
      .post('/payroll/calculate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        year: lifecyclePayrollYear,
        month: lifecyclePayrollMonth,
        payrollType: lifecyclePayrollType,
      })
      .expect(201);

    const calculatedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(calculatedPeriod.status).toBe('CALCULATED');
    expect(calculatedPeriod.version).toBe(1);

    const approveAuditCountBefore = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'APPROVE_PAYROLL',
      },
    });

    const approveRequests = await Promise.all([
      request(app.getHttpServer())
        .post(`/payroll/${lifecyclePayrollPeriodId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`),

      request(app.getHttpServer())
        .post(`/payroll/${lifecyclePayrollPeriodId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`),
    ]);

    const approveStatuses = approveRequests
      .map((response) => response.status)
      .sort((a, b) => a - b);

    expect(approveStatuses).toEqual([201, 400]);

    const approvedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(approvedPeriod.status).toBe('APPROVED');
    expect(approvedPeriod.version).toBe(2);
    expect(approvedPeriod.approvedAt).not.toBeNull();
    expect(approvedPeriod.approvedById).not.toBeNull();

    const approveAuditCountAfter = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'APPROVE_PAYROLL',
      },
    });

    expect(approveAuditCountAfter).toBe(approveAuditCountBefore + 1);

    const closeAuditCountBefore = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'CLOSE_PAYROLL',
      },
    });

    const auditSpy = jest
      .spyOn(auditService, 'log')
      .mockRejectedValueOnce(new Error('E2E forced close audit failure'));

    try {
      await request(app.getHttpServer())
        .post(`/payroll/${lifecyclePayrollPeriodId}/close`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(500);
    } finally {
      auditSpy.mockRestore();
    }

    const afterFailedClose = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(afterFailedClose.status).toBe('APPROVED');
    expect(afterFailedClose.version).toBe(2);
    expect(afterFailedClose.closedAt).toBeNull();
    expect(afterFailedClose.closedById).toBeNull();

    const closeAuditCountAfterFailure = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'CLOSE_PAYROLL',
      },
    });

    expect(closeAuditCountAfterFailure).toBe(closeAuditCountBefore);

    await request(app.getHttpServer())
      .post(`/payroll/${lifecyclePayrollPeriodId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const closedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(closedPeriod.status).toBe('CLOSED');
    expect(closedPeriod.version).toBe(3);
    expect(closedPeriod.closedAt).not.toBeNull();
    expect(closedPeriod.closedById).not.toBeNull();

    const closeAuditCountAfterSuccess = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'CLOSE_PAYROLL',
      },
    });

    expect(closeAuditCountAfterSuccess).toBe(closeAuditCountBefore + 1);

    await request(app.getHttpServer())
      .post(`/payroll/${lifecyclePayrollPeriodId}/reopen`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const reopenedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
      where: {
        id: lifecyclePayrollPeriodId,
      },
    });

    expect(reopenedPeriod.status).toBe('REOPENED');
    expect(reopenedPeriod.version).toBe(4);
    expect(reopenedPeriod.closedAt).toBeNull();
    expect(reopenedPeriod.closedById).toBeNull();

    const reopenAuditCount = await prisma.auditLog.count({
      where: {
        entity: 'PayrollPeriod',
        entityId: lifecyclePayrollPeriodId,
        action: 'REOPEN_PAYROLL',
      },
    });

    expect(reopenAuditCount).toBe(1);
  });

  it('DELETE /employees/:id debe desactivar el colaborador', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/employees/${createdEmployeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.id).toBe(createdEmployeeId);
    expect(response.body.status).not.toBe('ACTIVE');
  });

  it('GET /audit debe registrar DEACTIVATE_EMPLOYEE', async () => {
    const response = await request(app.getHttpServer())
      .get('/audit?action=DEACTIVATE_EMPLOYEE&entity=Employee&page=1&limit=100')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) => record.entityId === createdEmployeeId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('DEACTIVATE_EMPLOYEE');
  });

  it('POST /employees debe crear un colaborador para terminación', async () => {
    const response = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        firstName: 'Laura',
        lastName: 'Terminacion E2E',
        documentType: 'CC',
        documentNumber: terminationDocumentNumber,
        email: terminationEmployeeEmail,
        phone: '3009876543',
        position: 'Analista E2E',
        department: 'Pruebas',
        contractType: 'INDEFINITE',
        baseSalary: 3000000,
        startDate: '2026-01-15',
        eps: 'Sura',
        pensionFund: 'Proteccion',
        arl: 'Positiva',
        compensationBox: 'Comfama',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.status).toBe('ACTIVE');

    terminationEmployeeId = response.body.id;
  });

  it('POST /employment-terminations debe crear una terminación en DRAFT', async () => {
    const response = await request(app.getHttpServer())
      .post('/employment-terminations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: terminationEmployeeId,
        terminationDate: '2026-09-08',
        reason: 'RESIGNATION',
        notes: 'Terminación automática E2E',
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.employeeId).toBe(terminationEmployeeId);
    expect(response.body.status).toBe('DRAFT');

    employmentTerminationId = response.body.id;
  });

  it('POST /employment-terminations/:id/calculate debe pasar a CALCULATED', async () => {
    const response = await request(app.getHttpServer())
      .post(`/employment-terminations/${employmentTerminationId}/calculate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        unpaidSalaryStartDate: '2026-09-01',
        pendingVacationDays: 7.5,
      })
      .expect(201);

    expect(response.body.status).toBe('CALCULATED');
    expect(response.body.calculatedAt).toBeDefined();
    expect(Number(response.body.earnedTotal)).toBeGreaterThan(0);

    expect(Array.isArray(response.body.concepts)).toBe(true);
    expect(response.body.concepts.length).toBeGreaterThan(0);
  });

  it('POST /employment-terminations/:id/approve debe pasar a APPROVED', async () => {
    const response = await request(app.getHttpServer())
      .post(`/employment-terminations/${employmentTerminationId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    expect(response.body.id).toBe(employmentTerminationId);
    expect(response.body.status).toBe('APPROVED');
  });

  it('POST /employment-terminations/:id/close debe cerrar y desactivar el colaborador', async () => {
    const response = await request(app.getHttpServer())
      .post(`/employment-terminations/${employmentTerminationId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    expect(response.body.id).toBe(employmentTerminationId);
    expect(response.body.status).toBe('CLOSED');

    expect(response.body.employee).toBeDefined();
    expect(response.body.employee.status).toBe('INACTIVE');
  });

  it('GET /employees/:id debe confirmar que el colaborador quedó INACTIVE', async () => {
    const response = await request(app.getHttpServer())
      .get(`/employees/${terminationEmployeeId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.id).toBe(terminationEmployeeId);
    expect(response.body.status).toBe('INACTIVE');
  });

  it('GET /audit debe registrar CLOSE_EMPLOYMENT_TERMINATION', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/audit?action=CLOSE_EMPLOYMENT_TERMINATION&entity=EmploymentTermination&page=1&limit=100',
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) =>
        record.entityId === employmentTerminationId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CLOSE_EMPLOYMENT_TERMINATION');
    expect(auditRecord.entity).toBe('EmploymentTermination');
  });

  it('POST /employment-terminations/:id/close debe rechazar un segundo cierre', async () => {
    const response = await request(app.getHttpServer())
      .post(`/employment-terminations/${employmentTerminationId}/close`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(response.body.message).toContain('no puede cerrarse');
  });

  it('GET /health debe responder 200 y confirmar conexión', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'nomina360-api');
    expect(response.body).toHaveProperty('database', 'connected');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('uptime');
  });
});
