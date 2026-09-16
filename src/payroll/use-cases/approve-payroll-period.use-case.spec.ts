import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovePayrollPeriodUseCase } from './approve-payroll-period.use-case';

describe('ApprovePayrollPeriodUseCase', () => {
  let useCase: ApprovePayrollPeriodUseCase;

  const companyId = 'company-1';
  const userId = 'user-1';
  const periodId = 'period-1';

  const calculatedPeriod = {
    id: periodId,
    companyId,
    name: null,
    payrollType: PayrollType.MONTHLY,
    year: 2026,
    month: 9,
    status: PayrollStatus.CALCULATED,
    version: 4,
    startDate: null,
    endDate: null,
    paymentDate: null,
    createdById: null,
    approvedById: null,
    closedById: null,
    approvedAt: null,
    closedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  };

  const approvedPeriod = {
    ...calculatedPeriod,
    status: PayrollStatus.APPROVED,
    version: 5,
    approvedById: userId,
    approvedAt: new Date('2026-09-16T12:00:00.000Z'),
  };

  const tx = {
    payrollPeriod: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    payrollPeriod: {
      findFirst: jest.fn(),
      // Kept temporarily so the current implementation can run
      // before it is refactored to the transactional CAS pattern.
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.payrollPeriod.findFirst.mockResolvedValue(calculatedPeriod);
    prismaMock.payrollPeriod.update.mockResolvedValue(approvedPeriod);

    tx.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    tx.payrollPeriod.findFirst.mockResolvedValue(approvedPeriod);

    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    auditServiceMock.log.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovePayrollPeriodUseCase,
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

    useCase = module.get<ApprovePayrollPeriodUseCase>(
      ApprovePayrollPeriodUseCase,
    );
  });

  it('should approve a calculated period with optimistic concurrency control', async () => {
    const result = await useCase.execute(companyId, userId, periodId);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.CALCULATED,
        version: 4,
      },
      data: {
        status: PayrollStatus.APPROVED,
        approvedAt: expect.any(Date),
        approvedById: userId,
        version: {
          increment: 1,
        },
      },
    });

    expect(result).toEqual(approvedPeriod);
  });

  it('should pass the transaction client to AuditService', async () => {
    await useCase.execute(companyId, userId, periodId);

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'APPROVE_PAYROLL',
        entity: 'PayrollPeriod',
        entityId: periodId,
      }),
      tx,
    );
  });

  it('should reject approval when the payroll period changes concurrently', async () => {
    tx.payrollPeriod.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      useCase.execute(companyId, userId, periodId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.CALCULATED,
        version: 4,
      },
      data: {
        status: PayrollStatus.APPROVED,
        approvedAt: expect.any(Date),
        approvedById: userId,
        version: {
          increment: 1,
        },
      },
    });

    expect(tx.payrollPeriod.findFirst).not.toHaveBeenCalled();
    expect(auditServiceMock.log).not.toHaveBeenCalled();
  });

  it('should propagate an audit failure from the transaction', async () => {
    auditServiceMock.log.mockRejectedValueOnce(new Error('audit failure'));

    await expect(useCase.execute(companyId, userId, periodId)).rejects.toThrow(
      'audit failure',
    );
  });

  it('should reject approval before opening a transaction when status is not CALCULATED', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      ...calculatedPeriod,
      status: PayrollStatus.DRAFT,
    });

    await expect(
      useCase.execute(companyId, userId, periodId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject when the payroll period does not exist', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce(null);

    await expect(
      useCase.execute(companyId, userId, periodId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
