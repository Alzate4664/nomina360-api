import { PayrollStatus, PayrollType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import { CalculatePayrollUseCase } from './calculate-payroll.use-case';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';
import Decimal from 'decimal.js';

describe('CalculatePayrollUseCase', () => {
  let useCase: CalculatePayrollUseCase;

  const prismaMock = {
    payrollPeriod: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employee: {
      findMany: jest.fn(),
    },
    payrollItem: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    payrollConceptDetail: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    payrollNovelty: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  // Shared tx mock — represents the Prisma.TransactionClient passed inside $transaction.
  // auditLog.create is included for TransactionClient shape fidelity;
  // it is not directly asserted in this spec because AuditService.log is mocked.
  const tx = {
    payrollConceptDetail: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    payrollItem: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    payrollPeriod: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const payrollCalculateMock: jest.MockedFunction<
    PayrollCalculatorService['calculate']
  > = jest.fn();
  const payrollCalculatorMock = { calculate: payrollCalculateMock };

  const severanceCalculateMock: jest.MockedFunction<
    SeverancePayrollCalculator['calculate']
  > = jest.fn();
  const severancePayrollCalculatorMock = { calculate: severanceCalculateMock };

  const accruedDaysCalculatorMock = {
    calculate: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const serviceBonusCalculateMock: jest.MockedFunction<
    ServiceBonusPayrollCalculator['calculate']
  > = jest.fn();
  const serviceBonusPayrollCalculatorMock = {
    calculate: serviceBonusCalculateMock,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-establish tx default implementations after clearAllMocks().
    tx.payrollConceptDetail.deleteMany.mockResolvedValue({ count: 0 });
    tx.payrollConceptDetail.create.mockResolvedValue({ id: 'concept-1' });
    tx.payrollItem.deleteMany.mockResolvedValue({ count: 0 });
    tx.payrollItem.create.mockResolvedValue({ id: 'item-1' });
    tx.payrollPeriod.updateMany.mockResolvedValue({ count: 1 });

    // Default: $transaction executes its callback with the shared tx client.
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalculatePayrollUseCase,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: PayrollCalculatorService,
          useValue: payrollCalculatorMock,
        },
        {
          provide: SeverancePayrollCalculator,
          useValue: severancePayrollCalculatorMock,
        },
        {
          provide: ServiceBonusPayrollCalculator,
          useValue: serviceBonusPayrollCalculatorMock,
        },
        {
          provide: AccruedDaysCalculator,
          useValue: accruedDaysCalculatorMock,
        },
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    useCase = module.get<CalculatePayrollUseCase>(CalculatePayrollUseCase);

    prismaMock.payrollPeriod.findFirst.mockResolvedValue(null);

    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
      status: PayrollStatus.CALCULATED,
      version: 0,
    });

    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        companyId: 'company-1',
        baseSalary: 3000000,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 0,
      },
    ]);

    prismaMock.payrollItem.findMany.mockResolvedValue([]);
    prismaMock.payrollNovelty.findMany.mockResolvedValue([]);

    prismaMock.payrollItem.create.mockResolvedValue({
      id: 'item-1',
    });

    prismaMock.payrollConceptDetail.create.mockResolvedValue({
      id: 'concept-1',
    });

    auditServiceMock.log.mockResolvedValue(undefined);
  });

  it('should use regular payroll calculator for monthly payroll', async () => {
    payrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: new Decimal('3000000'),
      deductionsTotal: new Decimal('240000'),
      netPay: new Decimal('2760000'),
      concepts: [
        {
          code: 'BASE_SALARY',
          name: 'Salario ordinario',
          type: 'EARNING',
          amount: new Decimal('3000000'),
        },
      ],
    });

    await useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY);

    expect(payrollCalculateMock).toHaveBeenCalledTimes(1);
    const [regularPayrollInput] = payrollCalculateMock.mock.calls[0];

    expect(Decimal.isDecimal(regularPayrollInput.baseSalary)).toBe(true);
    expect(regularPayrollInput.baseSalary.toString()).toBe('3000000');
    expect(regularPayrollInput.workedDays).toBe(30);
    expect(regularPayrollInput.novelties).toEqual([]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();
  });

  it('should use severance payroll calculator for severance payroll', async () => {
    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.CALCULATED,
      version: 0,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(360);

    severancePayrollCalculatorMock.calculate.mockReturnValue({
      severanceBase: new Decimal('3000000'),
      earnedTotal: new Decimal('3360000'),
      deductionsTotal: new Decimal(0),
      netPay: new Decimal('3360000'),
      concepts: [
        {
          code: 'SEVERANCE',
          name: 'Cesantías',
          type: 'EARNING',
          amount: new Decimal('3000000'),
        },
        {
          code: 'SEVERANCE_INTEREST',
          name: 'Intereses de cesantías',
          type: 'EARNING',
          amount: new Decimal('360000'),
        },
      ],
    });

    await useCase.execute(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.SEVERANCE,
    );

    expect(accruedDaysCalculatorMock.calculate).toHaveBeenCalledWith(
      new Date('2025-01-01T00:00:00.000Z'),
      2026,
      12,
    );

    expect(severanceCalculateMock).toHaveBeenCalledTimes(1);
    const [severanceInput] = severanceCalculateMock.mock.calls[0];

    expect(Decimal.isDecimal(severanceInput.baseSalary)).toBe(true);
    expect(severanceInput.baseSalary.toString()).toBe('3000000');
    expect(severanceInput.accruedDays).toBe(360);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(payrollCalculatorMock.calculate).not.toHaveBeenCalled();
  });

  it('should skip employee when severance accrued days are zero', async () => {
    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.CALCULATED,
      version: 0,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(0);

    await useCase.execute(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.SEVERANCE,
    );

    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();

    expect(tx.payrollItem.create).not.toHaveBeenCalled();
  });

  it('should use service bonus payroll calculator for first semester bonus', async () => {
    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 6,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 6,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.CALCULATED,
      version: 0,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(180);

    serviceBonusPayrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: new Decimal('1500000'),
      deductionsTotal: new Decimal(0),
      netPay: new Decimal('1500000'),
      concepts: [
        {
          code: 'SERVICE_BONUS',
          name: 'Prima de servicios',
          type: 'EARNING',
          amount: new Decimal('1500000'),
        },
      ],
    });

    await useCase.execute('company-1', 'user-1', 2026, 6, PayrollType.BONUS);

    expect(accruedDaysCalculatorMock.calculate).toHaveBeenCalledWith(
      new Date('2025-01-01T00:00:00.000Z'),
      2026,
      6,
      1,
    );

    expect(serviceBonusCalculateMock).toHaveBeenCalledTimes(1);
    const [serviceBonusInput] = serviceBonusCalculateMock.mock.calls[0];

    expect(Decimal.isDecimal(serviceBonusInput.baseSalary)).toBe(true);
    expect(serviceBonusInput.baseSalary.toString()).toBe('3000000');
    expect(serviceBonusInput.accruedDays).toBe(180);

    expect(payrollCalculatorMock.calculate).not.toHaveBeenCalled();
    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();
  });

  it('should use service bonus payroll calculator for second semester bonus', async () => {
    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.CALCULATED,
      version: 0,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(180);

    serviceBonusPayrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: new Decimal('1500000'),
      deductionsTotal: new Decimal(0),
      netPay: new Decimal('1500000'),
      concepts: [],
    });

    await useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.BONUS);

    expect(accruedDaysCalculatorMock.calculate).toHaveBeenCalledWith(
      new Date('2025-01-01T00:00:00.000Z'),
      2026,
      12,
      7,
    );
  });

  it('should skip employee when service bonus accrued days are zero', async () => {
    accruedDaysCalculatorMock.calculate.mockReturnValue(0);

    await useCase.execute('company-1', 'user-1', 2026, 6, PayrollType.BONUS);

    expect(serviceBonusPayrollCalculatorMock.calculate).not.toHaveBeenCalled();
    expect(tx.payrollItem.create).not.toHaveBeenCalled();
  });

  describe('transaction safety', () => {
    beforeEach(() => {
      payrollCalculatorMock.calculate.mockReturnValue({
        earnedTotal: new Decimal('3000000'),
        deductionsTotal: new Decimal('240000'),
        netPay: new Decimal('2760000'),
        concepts: [
          {
            code: 'BASE_SALARY',
            name: 'Salario ordinario',
            type: 'EARNING',
            amount: new Decimal('3000000'),
          },
        ],
      });
    });

    it('should reject calculation when payroll period version changes concurrently', async () => {
      const existingPeriod = {
        id: 'period-1',
        companyId: 'company-1',
        year: 2026,
        month: 12,
        payrollType: PayrollType.MONTHLY,
        status: PayrollStatus.CALCULATED,
        version: 3,
      };

      prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce(existingPeriod);

      tx.payrollPeriod.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.payrollPeriod.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'period-1',
          companyId: 'company-1',
          version: 3,
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
          status: PayrollStatus.CALCULATED,
          version: {
            increment: 1,
          },
        },
      });

      expect(tx.payrollConceptDetail.deleteMany).not.toHaveBeenCalled();
      expect(tx.payrollItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(tx.payrollConceptDetail.create).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('should pass the transaction client to AuditService', async () => {
      await useCase.execute(
        'company-1',
        'user-1',
        2026,
        12,
        PayrollType.MONTHLY,
      );

      expect(auditServiceMock.log).toHaveBeenCalledTimes(1);
      const [auditData, auditClient] = auditServiceMock.log.mock.calls[0] as [
        Parameters<AuditService['log']>[0],
        typeof tx,
      ];

      expect(auditData).toMatchObject({
        companyId: 'company-1',
        userId: 'user-1',
        action: 'CALCULATE_PAYROLL',
        entity: 'PayrollPeriod',
        entityId: 'period-1',
      });
      expect(auditData.newValue).toMatchObject({
        year: 2026,
        month: 12,
        status: PayrollStatus.CALCULATED,
      });
      expect(auditClient).toBe(tx);
    });

    it('should use tx for all persistence writes', async () => {
      prismaMock.payrollItem.findMany.mockResolvedValue([
        {
          id: 'old-item-1',
        },
      ]);

      await useCase.execute(
        'company-1',
        'user-1',
        2026,
        12,
        PayrollType.MONTHLY,
      );

      expect(tx.payrollConceptDetail.deleteMany).toHaveBeenCalledWith({
        where: {
          payrollItemId: {
            in: ['old-item-1'],
          },
        },
      });

      expect(tx.payrollItem.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: ['old-item-1'],
          },
        },
      });

      expect(tx.payrollItem.create).toHaveBeenCalled();
      expect(tx.payrollConceptDetail.create).toHaveBeenCalled();
      expect(tx.payrollPeriod.updateMany).toHaveBeenCalled();

      expect(prismaMock.payrollConceptDetail.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.payrollItem.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.payrollItem.create).not.toHaveBeenCalled();
      expect(prismaMock.payrollConceptDetail.create).not.toHaveBeenCalled();
      expect(prismaMock.payrollPeriod.update).not.toHaveBeenCalled();
    });

    it('should propagate a transaction failure and not audit the calculation', async () => {
      prismaMock.$transaction.mockRejectedValueOnce(new Error('DB failure'));

      await expect(
        useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY),
      ).rejects.toThrow('DB failure');

      expect(auditServiceMock.log).not.toHaveBeenCalled();
      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(tx.payrollPeriod.updateMany).not.toHaveBeenCalled();
    });

    it('should not audit when an item write fails after claiming the period', async () => {
      prismaMock.employee.findMany.mockResolvedValue([
        {
          id: 'employee-1',
          companyId: 'company-1',
          baseSalary: 3000000,
          startDate: new Date('2025-01-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
        {
          id: 'employee-2',
          companyId: 'company-1',
          baseSalary: 3500000,
          startDate: new Date('2025-02-01T00:00:00.000Z'),
          status: 'ACTIVE',
        },
      ]);

      tx.payrollItem.create
        .mockResolvedValueOnce({
          id: 'item-1',
        })
        .mockRejectedValueOnce(new Error('constraint violation'));

      await expect(
        useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY),
      ).rejects.toThrow('constraint violation');

      expect(tx.payrollItem.create).toHaveBeenCalledTimes(2);
      expect(tx.payrollPeriod.updateMany).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('should reject before opening a transaction when there are no active employees', async () => {
      prismaMock.employee.findMany.mockResolvedValue([]);

      await expect(
        useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.payrollPeriod.create).not.toHaveBeenCalled();
      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });
  });
});
