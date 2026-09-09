import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  ConceptType,
  ContractType,
  EmployeeStatus,
  TerminationReason,
  TerminationStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmploymentTerminationsService } from './employment-terminations.service';
import { TerminationPayrollCalculator } from '../payroll/calculator/termination-payroll.calculator';

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
      update: jest.fn(),
    },
    employmentTerminationConcept: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  const terminationPayrollCalculator = {
    calculate: jest.fn(),
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

  const calculateDto = {
    unpaidSalaryStartDate: '2026-09-01',
    pendingVacationDays: 7.5,
  };

  const calculation = {
    salaryDays: 8,
    severanceDays: 248,
    serviceBonusDays: 68,
    salary: 800000,
    severance: 2500000,
    serviceBonus: 600000,
    vacation: 750000,
    earnedTotal: 4650000,
    concepts: [
      {
        code: 'BASE_SALARY',
        name: 'Salario ordinario',
        type: ConceptType.EARNING,
        amount: 800000,
      },
      {
        code: 'SEVERANCE',
        name: 'Cesantías',
        type: ConceptType.EARNING,
        amount: 2300000,
      },
      {
        code: 'SEVERANCE_INTEREST',
        name: 'Intereses de cesantías',
        type: ConceptType.EARNING,
        amount: 200000,
      },
      {
        code: 'SERVICE_BONUS',
        name: 'Prima de servicios',
        type: ConceptType.EARNING,
        amount: 600000,
      },
      {
        code: 'TERMINATION_VACATION',
        name: 'Vacaciones pendientes',
        type: ConceptType.EARNING,
        amount: 750000,
      },
    ],
  };

  const buildTermination = (
    status: TerminationStatus = TerminationStatus.DRAFT,
  ) => ({
    id: 'termination-1',
    companyId,
    employeeId: employee.id,
    terminationDate: new Date('2026-09-08T00:00:00.000Z'),
    reason: TerminationReason.RESIGNATION,
    status,
    notes: 'Retiro voluntario',

    unpaidSalaryStartDate: null,
    pendingVacationDays: null,
    calculatedBaseSalary: null,
    salaryDays: null,
    severanceDays: null,
    serviceBonusDays: null,
    earnedTotal: null,
    calculatedAt: null,

    createdAt: new Date(),
    updatedAt: new Date(),

    employee,
    concepts: [],
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new EmploymentTerminationsService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
      terminationPayrollCalculator as unknown as TerminationPayrollCalculator,
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

  it('should calculate and persist an employment termination', async () => {
    const termination = buildTermination();

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce({
        ...termination,
        status: TerminationStatus.CALCULATED,
        calculatedBaseSalary: employee.baseSalary,
        salaryDays: calculation.salaryDays,
        severanceDays: calculation.severanceDays,
        serviceBonusDays: calculation.serviceBonusDays,
        earnedTotal: calculation.earnedTotal,
        employee,
        concepts: calculation.concepts,
      });

    terminationPayrollCalculator.calculate.mockReturnValue(calculation);

    const tx = {
      employmentTerminationConcept: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({
          count: calculation.concepts.length,
        }),
      },
      employmentTermination: {
        update: jest.fn().mockResolvedValue({
          ...termination,
          status: TerminationStatus.CALCULATED,
        }),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    auditService.log.mockResolvedValue({});

    const result = await service.calculate(
      companyId,
      userId,
      termination.id,
      calculateDto,
    );

    expect(terminationPayrollCalculator.calculate).toHaveBeenCalledWith({
      baseSalary: 3000000,
      employeeStartDate: employee.startDate,
      terminationDate: termination.terminationDate,
      unpaidSalaryStartDate: new Date('2026-09-01'),
      pendingVacationDays: 7.5,
    });

    expect(tx.employmentTermination.update).toHaveBeenCalledWith({
      where: {
        id: termination.id,
      },
      data: expect.objectContaining({
        pendingVacationDays: 7.5,
        calculatedBaseSalary: 3000000,
        salaryDays: 8,
        severanceDays: 248,
        serviceBonusDays: 68,
        earnedTotal: 4650000,
        status: TerminationStatus.CALCULATED,
      }),
    });

    expect(tx.employmentTerminationConcept.createMany).toHaveBeenCalledWith({
      data: calculation.concepts.map((concept) => ({
        employmentTerminationId: termination.id,
        conceptCode: concept.code,
        conceptName: concept.name,
        type: concept.type,
        amount: concept.amount,
      })),
    });

    expect(result).toBeDefined();
  });

  it('should allow recalculating a calculated termination and replace old concepts', async () => {
    const termination = buildTermination(TerminationStatus.CALCULATED);

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce(termination);

    terminationPayrollCalculator.calculate.mockReturnValue(calculation);

    const tx = {
      employmentTerminationConcept: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
        createMany: jest.fn().mockResolvedValue({
          count: calculation.concepts.length,
        }),
      },
      employmentTermination: {
        update: jest.fn().mockResolvedValue(termination),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.calculate(companyId, userId, termination.id, calculateDto);

    expect(tx.employmentTerminationConcept.deleteMany).toHaveBeenCalledWith({
      where: {
        employmentTerminationId: termination.id,
      },
    });

    expect(tx.employmentTerminationConcept.createMany).toHaveBeenCalled();
  });

  it('should reject recalculation of an approved termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(TerminationStatus.APPROVED),
    );

    await expect(
      service.calculate(companyId, userId, 'termination-1', calculateDto),
    ).rejects.toThrow(BadRequestException);

    expect(terminationPayrollCalculator.calculate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject recalculation of a closed termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(TerminationStatus.CLOSED),
    );

    await expect(
      service.calculate(companyId, userId, 'termination-1', calculateDto),
    ).rejects.toThrow(BadRequestException);

    expect(terminationPayrollCalculator.calculate).not.toHaveBeenCalled();
  });

  it('should reject calculation when termination does not belong to company', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    await expect(
      service.calculate('company-2', userId, 'termination-1', calculateDto),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.employmentTermination.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'termination-1',
        companyId: 'company-2',
      },
      include: {
        employee: true,
        concepts: true,
      },
    });

    expect(terminationPayrollCalculator.calculate).not.toHaveBeenCalled();
  });

  it('should reject unpaid salary start date before employee start date', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(),
    );

    await expect(
      service.calculate(companyId, userId, 'termination-1', {
        unpaidSalaryStartDate: '2026-01-01',
        pendingVacationDays: 0,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(terminationPayrollCalculator.calculate).not.toHaveBeenCalled();
  });

  it('should reject unpaid salary start date after termination date', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(),
    );

    await expect(
      service.calculate(companyId, userId, 'termination-1', {
        unpaidSalaryStartDate: '2026-09-09',
        pendingVacationDays: 0,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(terminationPayrollCalculator.calculate).not.toHaveBeenCalled();
  });

  it('should register calculation audit using the transaction client', async () => {
    const termination = buildTermination();

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce(termination);

    terminationPayrollCalculator.calculate.mockReturnValue(calculation);

    const tx = {
      employmentTerminationConcept: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({
          count: calculation.concepts.length,
        }),
      },
      employmentTermination: {
        update: jest.fn().mockResolvedValue(termination),
      },

      employee: {
        update: jest.fn().mockResolvedValue({
          id: 'employee-1',
          status: EmployeeStatus.INACTIVE,
        }),
      },

      auditLog: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.calculate(companyId, userId, termination.id, calculateDto);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'CALCULATE_EMPLOYMENT_TERMINATION',
        entity: 'EmploymentTermination',
        entityId: termination.id,
      }),
      tx,
    );
  });

  it('should approve a calculated employment termination', async () => {
    const termination = {
      ...buildTermination(TerminationStatus.CALCULATED),
      calculatedBaseSalary: 3000000,
      earnedTotal: 4650000,
      calculatedAt: new Date(),
    };

    const approvedTermination = {
      ...termination,
      status: TerminationStatus.APPROVED,
    };

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce(approvedTermination);

    const tx = {
      employmentTermination: {
        update: jest.fn().mockResolvedValue(approvedTermination),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    const result = await service.approve(companyId, userId, termination.id);

    expect(tx.employmentTermination.update).toHaveBeenCalledWith({
      where: {
        id: termination.id,
      },
      data: {
        status: TerminationStatus.APPROVED,
      },
    });

    expect(result).toEqual(approvedTermination);
  });

  it('should close an approved employment termination and deactivate the employee', async () => {
    const termination = {
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      terminationDate: new Date('2026-09-08T00:00:00.000Z'),
      reason: TerminationReason.RESIGNATION,
      status: TerminationStatus.APPROVED,
      notes: null,
      concepts: [],
      employee: {
        id: 'employee-1',
        companyId,
        status: EmployeeStatus.ACTIVE,
      },
    };

    const closedTermination = {
      ...termination,
      status: TerminationStatus.CLOSED,
      employee: {
        ...termination.employee,
        status: EmployeeStatus.INACTIVE,
      },
    };

    const closeTx = {
      employmentTermination: {
        update: jest.fn().mockResolvedValue({
          ...termination,
          status: TerminationStatus.CLOSED,
        }),
      },
      employee: {
        update: jest.fn().mockResolvedValue({
          ...termination.employee,
          status: EmployeeStatus.INACTIVE,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce(closedTermination);

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(closeTx);
    });

    const result = await service.close(companyId, userId, 'termination-1');

    expect(prisma.employmentTermination.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: 'termination-1',
          companyId,
        },
      }),
    );

    expect(closeTx.employmentTermination.update).toHaveBeenCalledWith({
      where: {
        id: 'termination-1',
      },
      data: {
        status: TerminationStatus.CLOSED,
      },
    });

    expect(closeTx.employee.update).toHaveBeenCalledWith({
      where: {
        id: 'employee-1',
      },
      data: {
        status: EmployeeStatus.INACTIVE,
      },
    });

    expect(result).toEqual(closedTermination);
  });

  it('should register approval in audit log using transaction client', async () => {
    const termination = {
      ...buildTermination(TerminationStatus.CALCULATED),
      calculatedBaseSalary: 3000000,
      earnedTotal: 4650000,
      calculatedAt: new Date(),
    };

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce({
        ...termination,
        status: TerminationStatus.APPROVED,
      });

    const tx = {
      employmentTermination: {
        update: jest.fn().mockResolvedValue({
          ...termination,
          status: TerminationStatus.APPROVED,
        }),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (callback) => callback(tx));

    await service.approve(companyId, userId, termination.id);

    expect(auditService.log).toHaveBeenCalledWith(
      {
        companyId,
        userId,
        action: 'APPROVE_EMPLOYMENT_TERMINATION',
        entity: 'EmploymentTermination',
        entityId: termination.id,
        oldValue: {
          status: TerminationStatus.CALCULATED,
        },
        newValue: {
          status: TerminationStatus.APPROVED,
        },
      },
      tx,
    );
  });

  it('should reject approval of a draft termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(TerminationStatus.DRAFT),
    );

    await expect(
      service.approve(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject approval of an already approved termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(TerminationStatus.APPROVED),
    );

    await expect(
      service.approve(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject approval of a closed termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(
      buildTermination(TerminationStatus.CLOSED),
    );

    await expect(
      service.approve(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should reject approval when calculated snapshot is incomplete', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue({
      ...buildTermination(TerminationStatus.CALCULATED),
      calculatedBaseSalary: 3000000,
      earnedTotal: null,
      calculatedAt: new Date(),
    });

    await expect(
      service.approve(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should enforce company isolation when approving a termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    await expect(
      service.approve('company-2', userId, 'termination-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.employmentTermination.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'termination-1',
        companyId: 'company-2',
      },
      include: {
        employee: true,
        concepts: true,
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should reject closing a draft termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue({
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      status: TerminationStatus.DRAFT,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.ACTIVE,
      },
      concepts: [],
    });

    await expect(
      service.close(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject closing a calculated termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue({
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      status: TerminationStatus.CALCULATED,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.ACTIVE,
      },
      concepts: [],
    });

    await expect(
      service.close(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject closing an already closed termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue({
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      status: TerminationStatus.CLOSED,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.INACTIVE,
      },
      concepts: [],
    });

    await expect(
      service.close(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject closing when employee is already inactive', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue({
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      status: TerminationStatus.APPROVED,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.INACTIVE,
      },
      concepts: [],
    });

    await expect(
      service.close(companyId, userId, 'termination-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should enforce company isolation when closing a termination', async () => {
    prisma.employmentTermination.findFirst.mockResolvedValue(null);

    await expect(
      service.close(companyId, userId, 'termination-1'),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.employmentTermination.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'termination-1',
          companyId,
        },
      }),
    );
  });

  it('should register closing audit using transaction client', async () => {
    const termination = {
      id: 'termination-1',
      companyId,
      employeeId: 'employee-1',
      status: TerminationStatus.APPROVED,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.ACTIVE,
      },
      concepts: [],
    };

    const closedTermination = {
      ...termination,
      status: TerminationStatus.CLOSED,
      employee: {
        ...termination.employee,
        status: EmployeeStatus.INACTIVE,
      },
    };

    const closeTx = {
      employmentTermination: {
        update: jest.fn().mockResolvedValue({
          ...termination,
          status: TerminationStatus.CLOSED,
        }),
      },
      employee: {
        update: jest.fn().mockResolvedValue({
          ...termination.employee,
          status: EmployeeStatus.INACTIVE,
        }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.employmentTermination.findFirst
      .mockResolvedValueOnce(termination)
      .mockResolvedValueOnce(closedTermination);

    prisma.$transaction.mockImplementation(async (callback) => {
      return callback(closeTx);
    });

    await service.close(companyId, userId, 'termination-1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'CLOSE_EMPLOYMENT_TERMINATION',
        entity: 'EmploymentTermination',
        entityId: 'termination-1',
        oldValue: expect.objectContaining({
          status: TerminationStatus.APPROVED,
          employeeStatus: EmployeeStatus.ACTIVE,
        }),
        newValue: expect.objectContaining({
          status: TerminationStatus.CLOSED,
          employeeStatus: EmployeeStatus.INACTIVE,
        }),
      }),
      closeTx,
    );
  });
});
