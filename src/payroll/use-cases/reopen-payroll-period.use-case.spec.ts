import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ReopenPayrollPeriodUseCase } from './reopen-payroll-period.use-case';

describe('ReopenPayrollPeriodUseCase', () => {
  let useCase: ReopenPayrollPeriodUseCase;

  const companyId = 'company-1';
  const userId = 'user-1';
  const periodId = 'period-1';

  const closedPeriod = {
    id: periodId,
    companyId,
    name: null,
    payrollType: PayrollType.MONTHLY,
    year: 2026,
    month: 9,
    status: PayrollStatus.CLOSED,
    version: 6,
    startDate: null,
    endDate: null,
    paymentDate: null,
    createdById: null,
    approvedById: 'approver-1',
    closedById: 'closer-1',
    approvedAt: new Date('2026-09-15T12:00:00.000Z'),
    closedAt: new Date('2026-09-16T12:00:00.000Z'),
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-16T12:00:00.000Z'),
  };

  const reopenedPeriod = {
    ...closedPeriod,
    status: PayrollStatus.REOPENED,
    version: 7,
    closedById: null,
    closedAt: null,
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
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.payrollPeriod.findFirst.mockResolvedValue(closedPeriod);
    prismaMock.payrollPeriod.update.mockResolvedValue(reopenedPeriod);

    tx.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    tx.payrollPeriod.findFirst.mockResolvedValue(reopenedPeriod);

    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    auditServiceMock.log.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReopenPayrollPeriodUseCase,
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

    useCase = module.get<ReopenPayrollPeriodUseCase>(
      ReopenPayrollPeriodUseCase,
    );
  });

  it('should reopen a closed period with optimistic concurrency control', async () => {
    const result = await useCase.execute(companyId, userId, periodId);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.CLOSED,
        version: 6,
      },
      data: {
        status: PayrollStatus.REOPENED,
        closedAt: null,
        closedById: null,
        version: {
          increment: 1,
        },
      },
    });

    expect(result).toEqual(reopenedPeriod);
  });

  it('should pass the transaction client to AuditService', async () => {
    await useCase.execute(companyId, userId, periodId);

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'REOPEN_PAYROLL',
        entity: 'PayrollPeriod',
        entityId: periodId,
      }),
      tx,
    );
  });

  it('should reject reopening when the payroll period changes concurrently', async () => {
    tx.payrollPeriod.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      useCase.execute(companyId, userId, periodId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.CLOSED,
        version: 6,
      },
      data: {
        status: PayrollStatus.REOPENED,
        closedAt: null,
        closedById: null,
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

  it('should reject reopening before opening a transaction when status is not CLOSED', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      ...closedPeriod,
      status: PayrollStatus.APPROVED,
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
