import { BadRequestException } from '@nestjs/common';
import { ContractType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const prismaMock = {
    employee: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);

    prismaMock.employee.findFirst.mockResolvedValue(null);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an indefinite contract employee', async () => {
    const createdEmployee = {
      id: 'employee-1',
      companyId: 'company-1',
      firstName: 'Miguel',
      lastName: 'Alzate',
      documentType: 'CC',
      documentNumber: '123456789',
      email: null,
      phone: null,
      position: 'Developer',
      department: null,
      contractType: ContractType.INDEFINITE,
      contractEndDate: null,
      baseSalary: 3000000,
      startDate: new Date('2026-01-01'),
      status: 'ACTIVE',
      eps: null,
      pensionFund: null,
      arl: null,
      compensationBox: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock.employee.create.mockResolvedValue(createdEmployee);

    const result = await service.create('company-1', 'user-1', {
      firstName: 'Miguel',
      lastName: 'Alzate',
      documentType: 'CC',
      documentNumber: '123456789',
      position: 'Developer',
      contractType: ContractType.INDEFINITE,
      baseSalary: 3000000,
      startDate: '2026-01-01',
    });

    expect(prismaMock.employee.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        firstName: 'Miguel',
        lastName: 'Alzate',
        documentType: 'CC',
        documentNumber: '123456789',
        email: undefined,
        phone: undefined,
        position: 'Developer',
        department: undefined,
        contractType: ContractType.INDEFINITE,
        contractEndDate: undefined,
        baseSalary: 3000000,
        startDate: new Date('2026-01-01'),
        eps: undefined,
        pensionFund: undefined,
        arl: undefined,
        compensationBox: undefined,
      },
    });

    expect(result).toEqual(createdEmployee);
  });

  it('should reject fixed term contract without contract end date', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        firstName: 'Laura',
        lastName: 'Gomez',
        documentType: 'CC',
        documentNumber: '987654321',
        position: 'Analyst',
        contractType: ContractType.FIXED_TERM,
        baseSalary: 2500000,
        startDate: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.employee.create).not.toHaveBeenCalled();
  });

  it('should create fixed term contract with contract end date', async () => {
    const createdEmployee = {
      id: 'employee-2',
      companyId: 'company-1',
      firstName: 'Laura',
      lastName: 'Gomez',
      documentType: 'CC',
      documentNumber: '987654321',
      position: 'Analyst',
      contractType: ContractType.FIXED_TERM,
      contractEndDate: new Date('2026-12-31'),
      baseSalary: 2500000,
      startDate: new Date('2026-01-01'),
    };

    prismaMock.employee.create.mockResolvedValue(createdEmployee);

    const result = await service.create('company-1', 'user-1', {
      firstName: 'Laura',
      lastName: 'Gomez',
      documentType: 'CC',
      documentNumber: '987654321',
      position: 'Analyst',
      contractType: ContractType.FIXED_TERM,
      contractEndDate: '2026-12-31',
      baseSalary: 2500000,
      startDate: '2026-01-01',
    });

    expect(prismaMock.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractType: ContractType.FIXED_TERM,
          contractEndDate: new Date('2026-12-31'),
        }),
      }),
    );

    expect(result).toEqual(createdEmployee);
  });

  it('should reject contract end date before start date', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        firstName: 'Carlos',
        lastName: 'Perez',
        documentType: 'CC',
        documentNumber: '456789123',
        position: 'Accountant',
        contractType: ContractType.FIXED_TERM,
        contractEndDate: '2025-12-31',
        baseSalary: 2800000,
        startDate: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.employee.create).not.toHaveBeenCalled();
  });
});
