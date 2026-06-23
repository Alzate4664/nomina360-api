import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Nomina360 API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;

  let createdUserId: string | undefined;
  let createdEmployeeId: string | undefined;
  let createdNoveltyId: string | undefined;

  const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const testUserEmail = `usuario-e2e-${uniqueSuffix}@nomina360.test`;
  const testEmployeeEmail = `empleado-e2e-${uniqueSuffix}@nomina360.test`;
  const testDocumentNumber = `E2E${Date.now()}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule =
      await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

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
    try {
      if (createdNoveltyId) {
        await prisma.payrollNovelty.deleteMany({
          where: {
            id: createdNoveltyId,
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
        createdNoveltyId,
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
    await request(app.getHttpServer())
      .get('/')
      .expect(200);
  });

  it('GET /users sin token debe responder 401', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .expect(401);
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

    expect(response.body.message).toContain(
      'limit no puede ser mayor que 100',
    );
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

    expect(response.body.message).toContain(
      'Estado de nómina no válido',
    );
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

    expect(response.body.message).toContain(
      'limit no puede ser mayor que 100',
    );
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
      (record: { entityId?: string }) =>
        record.entityId === createdUserId,
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
        contractType: 'Indefinido',
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
      (record: { entityId?: string }) =>
        record.entityId === createdEmployeeId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CREATE_EMPLOYEE');
  });

  it('POST /payroll-novelties debe crear una novedad', async () => {
    const response = await request(app.getHttpServer())
      .post('/payroll-novelties')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        employeeId: createdEmployeeId,
        type: 'BONUS',
        amount: 150000,
        description: 'Bonificación automática E2E',
        periodYear: 2026,
        periodMonth: 8,
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body.employeeId).toBe(createdEmployeeId);
    expect(response.body.type).toBe('BONUS');

    createdNoveltyId = response.body.id;
  });

  it('GET /payroll-novelties debe encontrar la novedad creada', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/payroll-novelties?year=2026&month=8&search=Bonificación&page=1&limit=20',
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
      (record: { entityId?: string }) =>
        record.entityId === createdNoveltyId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('CREATE_PAYROLL_NOVELTY');
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
      .get(
        '/audit?action=DEACTIVATE_EMPLOYEE&entity=Employee&page=1&limit=100',
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const auditRecord = response.body.data.find(
      (record: { entityId?: string }) =>
        record.entityId === createdEmployeeId,
    );

    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('DEACTIVATE_EMPLOYEE');
  });
});