import { BadRequestException, ConflictException } from '@nestjs/common';
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
      updateMany: jest.fn(),
    },
    payrollNovelty: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    payrollItem: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    payrollConceptDetail: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  type PrismaMock = typeof prismaMock;
  type TransactionCallback = (tx: PrismaMock) => Promise<unknown>;

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

    prismaMock.$transaction.mockImplementation(
      async (callback: TransactionCallback) => callback(prismaMock),
    );

    prismaMock.employee.findFirst.mockResolvedValue({
      id: 'employee-1',
      companyId: 'company-1',
      status: 'ACTIVE',
    });

    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status: PayrollStatus.DRAFT,
      version: 0,
    });
    prismaMock.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.payrollItem.findMany.mockResolvedValue([]);
    prismaMock.payrollItem.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.payrollConceptDetail.deleteMany.mockResolvedValue({ count: 0 });
    auditServiceMock.log.mockResolvedValue({ id: 'audit-1' });
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

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      {
        companyId: 'company-1',
        userId: 'user-1',
        action: 'CREATE_PAYROLL_NOVELTY',
        entity: 'PayrollNovelty',
        entityId: 'novelty-1',
        newValue: createdNovelty,
      },
      prismaMock,
    );

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

  it('should move a draft period to collecting novelties and increment its version', async () => {
    const createdNovelty = {
      id: 'bonus-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
      createdAt: new Date(),
    };
    prismaMock.payrollNovelty.create.mockResolvedValue(createdNovelty);

    await service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
    });

    expect(prismaMock.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'period-1',
        companyId: 'company-1',
        version: 0,
        status: {
          in: [
            PayrollStatus.DRAFT,
            PayrollStatus.COLLECTING_NOVELTIES,
            PayrollStatus.CALCULATED,
            PayrollStatus.REOPENED,
          ],
        },
      },
      data: {
        status: PayrollStatus.COLLECTING_NOVELTIES,
        version: {
          increment: 1,
        },
      },
    });

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      {
        companyId: 'company-1',
        userId: 'user-1',
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
        entity: 'PayrollPeriod',
        entityId: 'period-1',
        oldValue: {
          status: PayrollStatus.DRAFT,
          version: 0,
        },
        newValue: {
          status: PayrollStatus.COLLECTING_NOVELTIES,
          version: 1,
        },
      },
      prismaMock,
    );
  });

  it('should invalidate persisted calculation when a calculated period receives a novelty', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status: PayrollStatus.CALCULATED,
      version: 4,
    });
    prismaMock.payrollItem.findMany.mockResolvedValue([
      { id: 'item-1' },
      { id: 'item-2' },
    ]);
    prismaMock.payrollNovelty.create.mockResolvedValue({
      id: 'bonus-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
      createdAt: new Date(),
    });

    await service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
    });

    expect(prismaMock.payrollConceptDetail.deleteMany).toHaveBeenCalledWith({
      where: {
        payrollItemId: {
          in: ['item-1', 'item-2'],
        },
      },
    });
    expect(prismaMock.payrollItem.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['item-1', 'item-2'],
        },
        companyId: 'company-1',
        payrollPeriodId: 'period-1',
      },
    });
  });

  it.each([
    PayrollStatus.CALCULATING,
    PayrollStatus.APPROVED,
    PayrollStatus.CLOSED,
    PayrollStatus.PAID,
    PayrollStatus.CANCELLED,
  ])('should reject novelty creation when period is %s', async (status) => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status,
      version: 3,
    });

    await expect(
      service.create('company-1', 'user-1', {
        employeeId: 'employee-1',
        payrollPeriodId: 'period-1',
        type: NoveltyType.BONUS,
        amount: 100000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollPeriod.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should return conflict if period changes concurrently', async () => {
    prismaMock.payrollPeriod.updateMany.mockResolvedValue({ count: 0 });

    const promise = service.create('company-1', 'user-1', {
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      status: 409,
    });

    expect(prismaMock.payrollNovelty.create).not.toHaveBeenCalled();
  });

  it('should delete a novelty atomically and invalidate its period', async () => {
    const novelty = {
      id: 'novelty-delete',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      amount: 100000,
      createdAt: new Date(),
      employee: {
        id: 'employee-1',
      },
    };
    const deletedNovelty = {
      id: 'novelty-delete',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
    };

    prismaMock.payrollNovelty.findFirst.mockResolvedValue(novelty);
    prismaMock.payrollNovelty.delete.mockResolvedValue(deletedNovelty);
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status: PayrollStatus.CALCULATED,
      version: 8,
    });
    prismaMock.payrollItem.findMany.mockResolvedValue([{ id: 'item-1' }]);

    const result = await service.remove(
      'company-1',
      'novelty-delete',
      'user-1',
    );

    expect(prismaMock.payrollConceptDetail.deleteMany).toHaveBeenCalled();
    expect(prismaMock.payrollItem.deleteMany).toHaveBeenCalled();
    expect(prismaMock.payrollNovelty.delete).toHaveBeenCalledWith({
      where: {
        id: 'novelty-delete',
      },
    });
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      {
        companyId: 'company-1',
        userId: 'user-1',
        action: 'DELETE_PAYROLL_NOVELTY',
        entity: 'PayrollNovelty',
        entityId: 'novelty-delete',
        oldValue: novelty,
      },
      prismaMock,
    );
    expect(result).toEqual(deletedNovelty);
  });

  it('should reject novelty deletion from a closed period', async () => {
    prismaMock.payrollNovelty.findFirst.mockResolvedValue({
      id: 'novelty-delete',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: NoveltyType.BONUS,
      employee: {
        id: 'employee-1',
      },
    });
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      status: PayrollStatus.CLOSED,
      version: 2,
    });

    await expect(
      service.remove('company-1', 'novelty-delete', 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollPeriod.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.payrollNovelty.delete).not.toHaveBeenCalled();
  });
});
