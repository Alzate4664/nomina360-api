import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ContractType,
  EmployeeStatus,
  TerminationReason,
  TerminationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmploymentTerminationsService } from './employment-terminations.service';

describe('EmploymentTerminationsService', () => {
  let service: EmploymentTerminationsService;

  const prisma = {
    employee: {
      findFirst: jest.fn(),
    },
    employmentTermination: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  const companyId = 'company-1';
  const userId = 'user-1';

  const employee = {
    id: 'employee-1',
    companyId,
    firstName: 'Carlos',
    lastName: 'Prueba',
    documentType: 'CC',
    documentNumber: '123456789',
    email: null,
    phone: null,
    position: 'Developer',
    department: null,
    contractType: ContractType.INDEFINITE,
    contractEndDate: null,
    baseSalary: 3000000,
    startDate: new Date('2026-01-15T00:00:00.000Z'),
    status: EmployeeStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    eps: null,
    pensionFund: null,
    arl: null,
    compensationBox: null,
  };

  const dto = {
    employeeId: employee.id,
    terminationDate: '2026-09-08',
    reason: TerminationReason.RESIGNATION,
    notes: 'Retiro voluntario',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new EmploymentTerminationsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a valid employment termination', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    const createdTermination = {
      id: 'termination-1',
      companyId,
      employeeId: employee.id,
      terminationDate: new Date(dto.terminationDate),
      reason: dto.reason,
      status: TerminationStatus.DRAFT,
      notes: dto.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee,
    };

    prisma.employmentTermination.create.mockResolvedValue(createdTermination);

    const result = await service.create(companyId, userId, dto);

    expect(result).toEqual(createdTermination);

    expect(prisma.employee.findFirst).toHaveBeenCalledWith({
      where: {
        id: employee.id,
        companyId,
      },
    });

    expect(prisma.employmentTermination.create).toHaveBeenCalled();

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'CREATE_EMPLOYMENT_TERMINATION',
        entity: 'EmploymentTermination',
        entityId: createdTermination.id,
      }),
    );
  });

  it('should reject an employee that does not belong to the company or does not exist', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(service.create(companyId, userId, dto)).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.employmentTermination.create).not.toHaveBeenCalled();
  });

  it('should reject an inactive employee', async () => {
    prisma.employee.findFirst.mockResolvedValue({
      ...employee,
      status: EmployeeStatus.INACTIVE,
    });

    await expect(service.create(companyId, userId, dto)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.employmentTermination.create).not.toHaveBeenCalled();
  });

  it('should reject a termination date before the employee start date', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);

    await expect(
      service.create(companyId, userId, {
        ...dto,
        terminationDate: '2025-12-31',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.employmentTermination.create).not.toHaveBeenCalled();
  });

  it('should reject a second active termination process', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);

    prisma.employmentTermination.findFirst.mockResolvedValue({
      id: 'existing-termination',
      companyId,
      employeeId: employee.id,
      status: TerminationStatus.DRAFT,
    });

    await expect(service.create(companyId, userId, dto)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.employmentTermination.create).not.toHaveBeenCalled();
  });

  it('should allow a new termination when previous processes are closed', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);

    // El service busca únicamente procesos activos.
    // Si Prisma no encuentra ninguno, significa que los anteriores
    // pueden estar CLOSED o que no existen.
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    const createdTermination = {
      id: 'termination-2',
      companyId,
      employeeId: employee.id,
      terminationDate: new Date(dto.terminationDate),
      reason: dto.reason,
      status: TerminationStatus.DRAFT,
      notes: dto.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
      employee,
    };

    prisma.employmentTermination.create.mockResolvedValue(createdTermination);

    const result = await service.create(companyId, userId, dto);

    expect(result.id).toBe('termination-2');

    expect(prisma.employmentTermination.findFirst).toHaveBeenCalledWith({
      where: {
        companyId,
        employeeId: employee.id,
        status: {
          in: [
            TerminationStatus.DRAFT,
            TerminationStatus.CALCULATED,
            TerminationStatus.APPROVED,
          ],
        },
      },
    });
  });

  it('should register the creation in the audit log', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    const createdTermination = {
      id: 'termination-audit',
      companyId,
      employeeId: employee.id,
      terminationDate: new Date(dto.terminationDate),
      reason: dto.reason,
      status: TerminationStatus.DRAFT,
      notes: dto.notes,
      employee,
    };

    prisma.employmentTermination.create.mockResolvedValue(createdTermination);

    await service.create(companyId, userId, dto);

    expect(auditService.log).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledWith({
      companyId,
      userId,
      action: 'CREATE_EMPLOYMENT_TERMINATION',
      entity: 'EmploymentTermination',
      entityId: createdTermination.id,
      newValue: createdTermination,
    });
  });

  it('should enforce company isolation when finding a termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    await expect(service.findOne('company-2', 'termination-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.employmentTermination.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'termination-1',
        companyId: 'company-2',
      },
      include: {
        employee: true,
      },
    });
  });
});
