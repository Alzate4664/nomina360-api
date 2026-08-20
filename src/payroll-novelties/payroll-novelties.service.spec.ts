import { BadRequestException } from '@nestjs/common';
import {
  LeaveType,
  NoveltyType,
  PayrollStatus,
  SickLeaveOrigin,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollNoveltiesService } from './payroll-novelties.service';

describe('PayrollNoveltiesService', () => {
  let service: PayrollNoveltiesService;

  const prismaMock = {
    employee: {
      findFirst: jest.fn(),
    },
    payrollPeriod: {
      findFirst: jest.fn(),
    },
    payrollNovelty: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
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
        PayrollNoveltiesService,
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

    service = module.get<PayrollNoveltiesService>(PayrollNoveltiesService);

    prismaMock.employee.findFirst.mockResolvedValue({
      id: 'employee-1',
      companyId: 'company-1',
      status: 'ACTIVE',
    });

    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status: PayrollStatus.DRAFT,
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject sick leave without sick leave origin', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.SICK_LEAVE,
        sickLeaveStartDay: 1,
        sickLeaveIbc: 3000000,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should reject sick leave without sick leave start day', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.SICK_LEAVE,
        sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
        sickLeaveIbc: 3000000,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should reject sick leave without sick leave IBC', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.SICK_LEAVE,
        sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
        sickLeaveStartDay: 1,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should reject sick leave data for non sick leave novelty', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.OVERTIME,
        sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
        sickLeaveStartDay: 1,
        sickLeaveIbc: 3000000,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should create sick leave with valid sick leave data', async () => {
    const createdNovelty = {
      id: 'novelty-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.SICK_LEAVE,
      sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
      sickLeaveStartDay: 1,
      sickLeaveIbc: 3000000,
      leaveType: null,
      dayType: 'REGULAR',
      quantity: 2,
      amount: null,
      description: 'Incapacidad por enfermedad común',
      createdAt: new Date(),
    };

    prismaMock.payrollNovelty.create.mockResolvedValue(createdNovelty);

    const result = await service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.SICK_LEAVE,
      sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
      sickLeaveStartDay: 1,
      sickLeaveIbc: 3000000,
      quantity: 2,
      description: 'Incapacidad por enfermedad común',
    });

    expect(prismaMock.payrollNovelty.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.SICK_LEAVE,
        dayType: undefined,
        sickLeaveOrigin: SickLeaveOrigin.COMMON_DISEASE,
        sickLeaveStartDay: 1,
        sickLeaveIbc: 3000000,
        leaveType: undefined,
        quantity: 2,
        amount: undefined,
        description: 'Incapacidad por enfermedad común',
      },
    });

    expect(auditServiceMock.log).toHaveBeenCalledWith({
      companyId: 'company-1',
      userId: 'user-1',
      action: 'CREATE_PAYROLL_NOVELTY',
      entity: 'PayrollNovelty',
      entityId: 'novelty-1',
      newValue: createdNovelty,
    });

    expect(result).toEqual(createdNovelty);
  });

  it('should reject leave without leave type', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.LEAVE,
        quantity: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should reject leave type for non leave novelty', async () => {
    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.BONUS,
        leaveType: LeaveType.PAID,
        amount: 100000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should create paid leave', async () => {
    const createdNovelty = {
      id: 'leave-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.LEAVE,
      dayType: 'REGULAR',
      sickLeaveOrigin: null,
      sickLeaveStartDay: null,
      sickLeaveIbc: null,
      leaveType: LeaveType.PAID,
      quantity: 3,
      amount: null,
      description: 'Licencia remunerada',
      createdAt: new Date(),
    };

    prismaMock.payrollNovelty.create.mockResolvedValue(createdNovelty);

    const result = await service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.LEAVE,
      leaveType: LeaveType.PAID,
      quantity: 3,
      description: 'Licencia remunerada',
    });

    expect(prismaMock.payrollNovelty.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.LEAVE,
        dayType: undefined,
        sickLeaveOrigin: undefined,
        sickLeaveStartDay: undefined,
        sickLeaveIbc: undefined,
        leaveType: LeaveType.PAID,
        quantity: 3,
        amount: undefined,
        description: 'Licencia remunerada',
      },
    });

    expect(result).toEqual(createdNovelty);
  });

  it('should create unpaid leave', async () => {
    const createdNovelty = {
      id: 'leave-2',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.LEAVE,
      dayType: 'REGULAR',
      sickLeaveOrigin: null,
      sickLeaveStartDay: null,
      sickLeaveIbc: null,
      leaveType: LeaveType.UNPAID,
      quantity: 4,
      amount: null,
      description: 'Licencia no remunerada',
      createdAt: new Date(),
    };

    prismaMock.payrollNovelty.create.mockResolvedValue(createdNovelty);

    const result = await service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.LEAVE,
      leaveType: LeaveType.UNPAID,
      quantity: 4,
      description: 'Licencia no remunerada',
    });

    expect(prismaMock.payrollNovelty.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.LEAVE,
        dayType: undefined,
        sickLeaveOrigin: undefined,
        sickLeaveStartDay: undefined,
        sickLeaveIbc: undefined,
        leaveType: LeaveType.UNPAID,
        quantity: 4,
        amount: undefined,
        description: 'Licencia no remunerada',
      },
    });

    expect(result).toEqual(createdNovelty);
  });
});
