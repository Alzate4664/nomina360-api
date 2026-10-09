import { PayrollStatus, PayrollType, Prisma } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import { CalculatePayrollUseCase } from './calculate-payroll.use-case';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';
import Decimal from 'decimal.js';
import { DEFAULT_PAYROLL_RULES } from '../rules/default-payroll-rules';
import {
  PayrollRuleSetSelectionError,
  PayrollRuleSetSelectionPolicy,
} from '../rules/payroll-rule-set-selection.policy';
import type { PayrollRules } from '../rules/payroll-rules';
import { PayrollRulesResolutionError } from '../rules/payroll-rules-resolver';

describe('CalculatePayrollUseCase', () => {
  let useCase: CalculatePayrollUseCase;

  const prismaMock = {
    payrollPeriod: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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
      createManyAndReturn: jest.fn(),
    },
    payrollConceptDetail: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    payrollNovelty: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const selectForPayrollPeriodMock: jest.MockedFunction<
    PayrollRuleSetSelectionPolicy['selectForPayrollPeriod']
  > = jest.fn();

  const payrollRuleSetSelectionPolicyMock = {
    selectForPayrollPeriod: selectForPayrollPeriodMock,
  };

  type PayrollPeriodUpdateManyFn = (
    args: Prisma.PayrollPeriodUpdateManyArgs,
  ) => Promise<Prisma.BatchPayload>;

  const payrollPeriodUpdateManyMock: jest.MockedFunction<PayrollPeriodUpdateManyFn> =
    jest.fn();

  // Shared tx mock — represents the Prisma.TransactionClient passed inside $transaction.
  // auditLog.create is included for TransactionClient shape fidelity;
  // it is not directly asserted in this spec because AuditService.log is mocked.
  const tx = {
    payrollConceptDetail: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
    },
    payrollItem: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      createManyAndReturn: jest.fn(),
    },
    payrollPeriod: {
      updateMany: payrollPeriodUpdateManyMock,
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

  const auditLogMock: jest.MockedFunction<AuditService['log']> = jest.fn();

  const auditServiceMock = {
    log: auditLogMock,
  };

  const serviceBonusCalculateMock: jest.MockedFunction<
    ServiceBonusPayrollCalculator['calculate']
  > = jest.fn();
  const serviceBonusPayrollCalculatorMock = {
    calculate: serviceBonusCalculateMock,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    selectForPayrollPeriodMock.mockResolvedValue({
      ruleSetId: 'rules-co-default',
      jurisdictionCode: 'CO',
      rules: DEFAULT_PAYROLL_RULES,
    });

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
        {
          provide: PayrollRuleSetSelectionPolicy,
          useValue: payrollRuleSetSelectionPolicyMock,
        },
      ],
    }).compile();

    useCase = module.get<CalculatePayrollUseCase>(CalculatePayrollUseCase);

    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      paymentDate: new Date('2027-01-05T00:00:00.000Z'),
      calculatedRuleSetId: null,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    prismaMock.payrollPeriod.findMany.mockImplementation(
      async (args: unknown): Promise<unknown[]> => {
        const period: unknown = await prismaMock.payrollPeriod.findFirst(args);

        return period === null || period === undefined ? [] : [period];
      },
    );

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

    tx.payrollConceptDetail.createMany.mockResolvedValue({ count: 1 });

    tx.payrollItem.createManyAndReturn.mockImplementation(
      (args: { data: Array<{ employeeId: string }> }) =>
        Promise.resolve(
          args.data.map((item, index) => ({
            id: `item-${index + 1}`,
            employeeId: item.employeeId,
          })),
        ),
    );
  });

  it('should reject calculation when payroll period does not exist', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce(null);

    await expect(
      useCase.execute('company-1', 'user-1', 'missing-period'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.payrollPeriod.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'missing-period',
        companyId: 'company-1',
      },
    });

    expect(prismaMock.payrollPeriod.create).not.toHaveBeenCalled();
    expect(prismaMock.employee.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject legacy calculation when payroll period does not exist', async () => {
    prismaMock.payrollPeriod.findMany.mockResolvedValueOnce([]);

    await expect(
      useCase.executeLegacy(
        'company-1',
        'user-1',
        2026,
        12,
        PayrollType.MONTHLY,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.employee.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject legacy calculation when period lookup is ambiguous', async () => {
    prismaMock.payrollPeriod.findMany.mockResolvedValueOnce([
      {
        id: 'period-first-half',
      },
      {
        id: 'period-second-half',
      },
    ]);

    await expect(
      useCase.executeLegacy(
        'company-1',
        'user-1',
        2026,
        8,
        PayrollType.SEMIMONTHLY,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.payrollPeriod.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        year: 2026,
        month: 8,
        payrollType: PayrollType.SEMIMONTHLY,
      },
      take: 2,
    });

    expect(prismaMock.employee.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should use regular payroll calculator for monthly payroll', async () => {
    const selectedRules: PayrollRules = {
      ...DEFAULT_PAYROLL_RULES,
      minimumWage: new Decimal('9876543'),
    };

    selectForPayrollPeriodMock.mockResolvedValueOnce({
      ruleSetId: 'rules-co-selected',
      jurisdictionCode: 'CO',
      rules: selectedRules,
    });

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

    await useCase.execute('company-1', 'user-1', 'period-1');

    expect(selectForPayrollPeriodMock).toHaveBeenCalledTimes(1);

    expect(selectForPayrollPeriodMock).toHaveBeenCalledWith('CO', {
      payrollType: PayrollType.MONTHLY,
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      calculatedRuleSetId: null,
    });

    expect(prismaMock.payrollPeriod.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'period-1',
        companyId: 'company-1',
      },
    });

    expect(prismaMock.payrollPeriod.create).not.toHaveBeenCalled();

    expect(payrollCalculateMock).toHaveBeenCalledTimes(1);
    const [regularPayrollInput] = payrollCalculateMock.mock.calls[0];

    expect(regularPayrollInput.rules).toBe(selectedRules);

    const selectedTransitionArgs =
      payrollPeriodUpdateManyMock.mock.calls[0]?.[0];

    expect(selectedTransitionArgs?.data.calculatedRuleSetId).toBe(
      'rules-co-selected',
    );

    const auditData = auditLogMock.mock.calls[0]?.[0];

    expect(auditData?.newValue).toMatchObject({
      calculatedRuleSetId: 'rules-co-selected',
    });

    expect(Decimal.isDecimal(regularPayrollInput.baseSalary)).toBe(true);
    expect(regularPayrollInput.baseSalary.toString()).toBe('3000000');
    expect(regularPayrollInput.workedDays).toBe(30);
    expect(regularPayrollInput.novelties).toEqual([]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();
  });

  it('should preserve the pinned rule set when recalculating a periodic payroll', async () => {
    const startDate = new Date('2026-12-01T00:00:00.000Z');
    const endDate = new Date('2026-12-31T00:00:00.000Z');

    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
      startDate,
      endDate,
      paymentDate: new Date('2027-01-05T00:00:00.000Z'),
      calculatedRuleSetId: 'rules-co-original',
      status: PayrollStatus.CALCULATED,
      version: 3,
    });

    selectForPayrollPeriodMock.mockResolvedValueOnce({
      ruleSetId: 'rules-co-original',
      jurisdictionCode: 'CO',
      rules: DEFAULT_PAYROLL_RULES,
    });

    payrollCalculateMock.mockReturnValue({
      earnedTotal: new Decimal('3000000'),
      deductionsTotal: new Decimal('240000'),
      netPay: new Decimal('2760000'),
      concepts: [],
    });

    await useCase.execute('company-1', 'user-1', 'period-1');

    expect(selectForPayrollPeriodMock).toHaveBeenCalledWith('CO', {
      payrollType: PayrollType.MONTHLY,
      startDate,
      endDate,
      calculatedRuleSetId: 'rules-co-original',
    });

    const pinnedTransitionArgs = payrollPeriodUpdateManyMock.mock.calls[0]?.[0];

    expect(pinnedTransitionArgs?.data?.calculatedRuleSetId).toBe(
      'rules-co-original',
    );
  });

  it('should translate a payroll period spanning multiple rule sets to ConflictException', async () => {
    selectForPayrollPeriodMock.mockRejectedValueOnce(
      new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_SPANS_MULTIPLE_RULE_SETS',
        'Payroll period spans multiple payroll rule sets',
      ),
    );

    await expect(
      useCase.execute('company-1', 'user-1', 'period-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.payrollItem.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should translate a missing published rule set to ConflictException', async () => {
    selectForPayrollPeriodMock.mockRejectedValueOnce(
      new PayrollRulesResolutionError(
        'RULE_SET_NOT_FOUND',
        'No published payroll rule set applies to CO',
      ),
    );

    await expect(
      useCase.execute('company-1', 'user-1', 'period-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.payrollItem.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should translate missing periodic payroll dates to ConflictException', async () => {
    selectForPayrollPeriodMock.mockRejectedValueOnce(
      new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_DATES_REQUIRED',
        'Payroll type MONTHLY requires startDate and endDate to select payroll rules',
      ),
    );

    await expect(
      useCase.execute('company-1', 'user-1', 'period-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.payrollItem.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should translate an invalid periodic payroll date range to ConflictException', async () => {
    selectForPayrollPeriodMock.mockRejectedValueOnce(
      new PayrollRuleSetSelectionError(
        'PAYROLL_PERIOD_DATE_RANGE_INVALID',
        'Payroll period startDate cannot be after endDate',
      ),
    );

    await expect(
      useCase.execute('company-1', 'user-1', 'period-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.payrollItem.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([PayrollType.EXTRAORDINARY, PayrollType.TERMINATION])(
    'should keep %s outside versioned rule set selection for now',
    async (payrollType) => {
      prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
        id: 'period-1',
        companyId: 'company-1',
        year: 2026,
        month: 12,
        payrollType,
        startDate: null,
        endDate: null,
        paymentDate: null,
        calculatedRuleSetId: null,
        status: PayrollStatus.DRAFT,
        version: 0,
      });

      payrollCalculateMock.mockReturnValue({
        earnedTotal: new Decimal('3000000'),
        deductionsTotal: new Decimal('240000'),
        netPay: new Decimal('2760000'),
        concepts: [],
      });

      await useCase.execute('company-1', 'user-1', 'period-1');

      expect(selectForPayrollPeriodMock).not.toHaveBeenCalled();

      const [regularPayrollInput] = payrollCalculateMock.mock.calls[0];

      expect(regularPayrollInput.rules).toBe(DEFAULT_PAYROLL_RULES);

      const transitionArgs = payrollPeriodUpdateManyMock.mock.calls[0]?.[0];

      expect(transitionArgs?.data).not.toHaveProperty('calculatedRuleSetId');
    },
  );

  it('should batch-load payroll novelties once and group them by employee', async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        companyId: 'company-1',
        baseSalary: 3000000,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 0,
      },
      {
        id: 'employee-2',
        companyId: 'company-1',
        baseSalary: 3500000,
        startDate: new Date('2025-02-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 0,
      },
    ]);

    const employeeOneNovelty = {
      id: 'novelty-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
    };

    const employeeTwoNovelty = {
      id: 'novelty-2',
      companyId: 'company-1',
      employeeId: 'employee-2',
      payrollPeriodId: 'period-1',
    };

    prismaMock.payrollNovelty.findMany.mockResolvedValue([
      employeeOneNovelty,
      employeeTwoNovelty,
    ]);

    payrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: new Decimal('3000000'),
      deductionsTotal: new Decimal('240000'),
      netPay: new Decimal('2760000'),
      concepts: [],
    });

    await useCase.execute('company-1', 'user-1', 'period-1');

    expect(prismaMock.payrollNovelty.findMany).toHaveBeenCalledTimes(1);

    expect(prismaMock.payrollNovelty.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        payrollPeriodId: 'period-1',
        employeeId: {
          in: ['employee-1', 'employee-2'],
        },
      },
    });

    expect(payrollCalculateMock).toHaveBeenCalledTimes(2);

    const [employeeOneInput] = payrollCalculateMock.mock.calls[0];
    const [employeeTwoInput] = payrollCalculateMock.mock.calls[1];

    expect(employeeOneInput.novelties).toEqual([employeeOneNovelty]);
    expect(employeeTwoInput.novelties).toEqual([employeeTwoNovelty]);
  });

  it('should map created payroll items by employeeId regardless of returned order', async () => {
    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        companyId: 'company-1',
        baseSalary: 3000000,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 0,
      },
      {
        id: 'employee-2',
        companyId: 'company-1',
        baseSalary: 3500000,
        startDate: new Date('2025-02-01T00:00:00.000Z'),
        status: 'ACTIVE',
        version: 0,
      },
    ]);

    payrollCalculatorMock.calculate
      .mockReturnValueOnce({
        earnedTotal: new Decimal('3000000'),
        deductionsTotal: new Decimal('240000'),
        netPay: new Decimal('2760000'),
        concepts: [
          {
            code: 'EMPLOYEE_1_CONCEPT',
            name: 'Concepto empleado 1',
            type: 'EARNING',
            amount: new Decimal('100000'),
          },
        ],
      })
      .mockReturnValueOnce({
        earnedTotal: new Decimal('3500000'),
        deductionsTotal: new Decimal('280000'),
        netPay: new Decimal('3220000'),
        concepts: [
          {
            code: 'EMPLOYEE_2_CONCEPT',
            name: 'Concepto empleado 2',
            type: 'EARNING',
            amount: new Decimal('200000'),
          },
        ],
      });

    tx.payrollItem.createManyAndReturn.mockResolvedValueOnce([
      {
        id: 'item-for-employee-2',
        employeeId: 'employee-2',
      },
      {
        id: 'item-for-employee-1',
        employeeId: 'employee-1',
      },
    ]);

    await useCase.execute('company-1', 'user-1', 'period-1');

    expect(tx.payrollConceptDetail.createMany).toHaveBeenCalledTimes(1);

    expect(tx.payrollConceptDetail.createMany).toHaveBeenCalledWith({
      data: [
        {
          payrollItemId: 'item-for-employee-1',
          conceptCode: 'EMPLOYEE_1_CONCEPT',
          conceptName: 'Concepto empleado 1',
          type: 'EARNING',
          amount: '100000',
        },
        {
          payrollItemId: 'item-for-employee-2',
          conceptCode: 'EMPLOYEE_2_CONCEPT',
          conceptName: 'Concepto empleado 2',
          type: 'EARNING',
          amount: '200000',
        },
      ],
    });
  });

  it('should use severance payroll calculator for severance payroll', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
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

    await useCase.executeLegacy(
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

    expect(severanceInput.rules).toBe(DEFAULT_PAYROLL_RULES);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(payrollCalculatorMock.calculate).not.toHaveBeenCalled();
    expect(prismaMock.payrollNovelty.findMany).not.toHaveBeenCalled();

    expect(selectForPayrollPeriodMock).not.toHaveBeenCalled();
  });

  it('should skip employee when severance accrued days are zero', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
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

    await useCase.executeLegacy(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.SEVERANCE,
    );

    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();

    expect(tx.payrollItem.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.payrollConceptDetail.createMany).not.toHaveBeenCalled();
  });

  it('should use service bonus payroll calculator for first semester bonus', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
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

    await useCase.executeLegacy(
      'company-1',
      'user-1',
      2026,
      6,
      PayrollType.BONUS,
    );

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

    expect(serviceBonusInput.rules).toBe(DEFAULT_PAYROLL_RULES);

    expect(payrollCalculatorMock.calculate).not.toHaveBeenCalled();
    expect(severancePayrollCalculatorMock.calculate).not.toHaveBeenCalled();
    expect(prismaMock.payrollNovelty.findMany).not.toHaveBeenCalled();

    expect(selectForPayrollPeriodMock).not.toHaveBeenCalled();
  });

  it('should use service bonus payroll calculator for second semester bonus', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValue({
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

    await useCase.executeLegacy(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.BONUS,
    );

    expect(accruedDaysCalculatorMock.calculate).toHaveBeenCalledWith(
      new Date('2025-01-01T00:00:00.000Z'),
      2026,
      12,
      7,
    );

    expect(tx.payrollItem.createManyAndReturn).toHaveBeenCalledTimes(1);
    expect(tx.payrollConceptDetail.createMany).not.toHaveBeenCalled();
  });

  it('should skip employee when service bonus accrued days are zero', async () => {
    prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 6,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.DRAFT,
      version: 0,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(0);

    await useCase.executeLegacy(
      'company-1',
      'user-1',
      2026,
      6,
      PayrollType.BONUS,
    );

    expect(serviceBonusPayrollCalculatorMock.calculate).not.toHaveBeenCalled();

    expect(tx.payrollItem.createManyAndReturn).not.toHaveBeenCalled();
    expect(tx.payrollConceptDetail.createMany).not.toHaveBeenCalled();
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
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        paymentDate: new Date('2027-01-05T00:00:00.000Z'),
        calculatedRuleSetId: 'rules-co-default',
        status: PayrollStatus.CALCULATED,
        version: 3,
      };

      prismaMock.payrollPeriod.findFirst.mockResolvedValueOnce(existingPeriod);

      tx.payrollPeriod.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        useCase.executeLegacy(
          'company-1',
          'user-1',
          2026,
          12,
          PayrollType.MONTHLY,
        ),
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
          calculatedRuleSetId: 'rules-co-default',
        },
      });

      expect(tx.payrollConceptDetail.deleteMany).not.toHaveBeenCalled();
      expect(tx.payrollItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(tx.payrollConceptDetail.create).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
      expect(tx.payrollItem.createManyAndReturn).not.toHaveBeenCalled();
      expect(tx.payrollConceptDetail.createMany).not.toHaveBeenCalled();
    });

    it('should pass the transaction client to AuditService', async () => {
      await useCase.executeLegacy(
        'company-1',
        'user-1',
        2026,
        12,
        PayrollType.MONTHLY,
      );

      expect(auditServiceMock.log).toHaveBeenCalledTimes(1);
      const auditCall = auditLogMock.mock.calls[0];

      expect(auditCall).toBeDefined();

      if (!auditCall) {
        throw new Error('Expected AuditService.log to be called');
      }

      const [auditData, auditClient] = auditCall;

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

      await useCase.executeLegacy(
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

      expect(tx.payrollItem.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(tx.payrollConceptDetail.createMany).toHaveBeenCalledTimes(1);
      expect(tx.payrollPeriod.updateMany).toHaveBeenCalled();

      expect(prismaMock.payrollConceptDetail.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.payrollItem.deleteMany).not.toHaveBeenCalled();
      expect(prismaMock.payrollItem.create).not.toHaveBeenCalled();
      expect(prismaMock.payrollItem.createManyAndReturn).not.toHaveBeenCalled();
      expect(prismaMock.payrollConceptDetail.create).not.toHaveBeenCalled();
      expect(prismaMock.payrollConceptDetail.createMany).not.toHaveBeenCalled();
      expect(prismaMock.payrollPeriod.update).not.toHaveBeenCalled();

      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(tx.payrollConceptDetail.create).not.toHaveBeenCalled();
    });

    it('should propagate a transaction failure and not audit the calculation', async () => {
      prismaMock.$transaction.mockRejectedValueOnce(new Error('DB failure'));

      await expect(
        useCase.executeLegacy(
          'company-1',
          'user-1',
          2026,
          12,
          PayrollType.MONTHLY,
        ),
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

      tx.payrollItem.createManyAndReturn.mockRejectedValueOnce(
        new Error('constraint violation'),
      );

      await expect(
        useCase.executeLegacy(
          'company-1',
          'user-1',
          2026,
          12,
          PayrollType.MONTHLY,
        ),
      ).rejects.toThrow('constraint violation');

      expect(tx.payrollItem.createManyAndReturn).toHaveBeenCalledTimes(1);
      expect(tx.payrollConceptDetail.createMany).not.toHaveBeenCalled();
      expect(tx.payrollPeriod.updateMany).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('should reject before opening a transaction when there are no active employees', async () => {
      prismaMock.employee.findMany.mockResolvedValue([]);

      await expect(
        useCase.executeLegacy(
          'company-1',
          'user-1',
          2026,
          12,
          PayrollType.MONTHLY,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.payrollPeriod.create).not.toHaveBeenCalled();
      expect(tx.payrollItem.create).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });
  });
});
