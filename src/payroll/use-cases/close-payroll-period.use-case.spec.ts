import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClosePayrollPeriodUseCase } from './close-payroll-period.use-case';

describe('ClosePayrollPeriodUseCase', () => {
  let useCase: ClosePayrollPeriodUseCase;

  const companyId = 'company-1';
  const userId = 'user-1';
  const periodId = 'period-1';

  const approvedPeriod = {
    id: periodId,
    companyId,
    name: null,
    payrollType: PayrollType.MONTHLY,
    year: 2026,
    month: 9,
    status: PayrollStatus.APPROVED,
    version: 5,
    startDate: null,
    endDate: null,
    paymentDate: null,
    createdById: null,
    approvedById: 'approver-1',
    closedById: null,
    approvedAt: new Date('2026-09-15T12:00:00.000Z'),
    closedAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-15T12:00:00.000Z'),
  };

  const closedPeriod = {
    ...approvedPeriod,
    status: PayrollStatus.CLOSED,
    version: 6,
    closedById: userId,
    closedAt: new Date('2026-09-16T12:00:00.000Z'),
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
      // Temporary compatibility with the current implementation.
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.payrollPeriod.findFirst.mockResolvedValue(approvedPeriod);
    prismaMock.payrollPeriod.update.mockResolvedValue(closedPeriod);

    tx.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });
    tx.payrollPeriod.findFirst.mockResolvedValue(closedPeriod);

    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    auditServiceMock.log.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClosePayrollPeriodUseCase,
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

    useCase = module.get<ClosePayrollPeriodUseCase>(ClosePayrollPeriodUseCase);
  });

  it('should close an approved period with optimistic concurrency control', async () => {
    const result = await useCase.execute(companyId, userId, periodId);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.APPROVED,
        version: 5,
      },
      data: {
        status: PayrollStatus.CLOSED,
        closedAt: expect.any(Date),
        closedById: userId,
        version: {
          increment: 1,
        },
      },
    });

    expect(result).toEqual(closedPeriod);
  });

  it('should pass the transaction client to AuditService', async () => {
    await useCase.execute(companyId, userId, periodId);

    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        userId,
        action: 'CLOSE_PAYROLL',
        entity: 'PayrollPeriod',
        entityId: periodId,
      }),
      tx,
    );
  });

  it('should reject closing when the payroll period changes concurrently', async () => {
    tx.payrollPeriod.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      useCase.execute(companyId, userId, periodId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
      where: {
        id: periodId,
        companyId,
        status: PayrollStatus.APPROVED,
        version: 5,
      },
      data: {
        status: PayrollStatus.CLOSED,
        closedAt: expect.any(Date),
        closedById: userId,
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

  it('should reject closing before opening a transaction when status is not APPROVED', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      ...approvedPeriod,
      status: PayrollStatus.CALCULATED,
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
