import { PayrollStatus, PayrollType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccruedDaysCalculator } from '../calculator/accrued-days.calculator';
import { SeverancePayrollCalculator } from '../calculator/severance-payroll.calculator';
import { PayrollCalculatorService } from '../payroll-calculator.service';
import { CalculatePayrollUseCase } from './calculate-payroll.use-case';
import { ServiceBonusPayrollCalculator } from '../calculator/service-bonus-payroll.calculator';

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
  };

  const payrollCalculatorMock = {
    calculate: jest.fn(),
  };

  const severancePayrollCalculatorMock = {
    calculate: jest.fn(),
  };

  const accruedDaysCalculatorMock = {
    calculate: jest.fn(),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const serviceBonusPayrollCalculatorMock = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
      status: PayrollStatus.CALCULATED,
    });

    prismaMock.employee.findMany.mockResolvedValue([
      {
        id: 'employee-1',
        companyId: 'company-1',
        baseSalary: 3000000,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
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
      earnedTotal: 3000000,
      deductionsTotal: 240000,
      netPay: 2760000,
      concepts: [
        {
          code: 'BASE_SALARY',
          name: 'Salario ordinario',
          type: 'EARNING',
          amount: 3000000,
        },
      ],
    });

    await useCase.execute('company-1', 'user-1', 2026, 12, PayrollType.MONTHLY);

    expect(payrollCalculatorMock.calculate).toHaveBeenCalledWith({
      baseSalary: 3000000,
      workedDays: 30,
      novelties: [],
    });

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
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.CALCULATED,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(360);

    severancePayrollCalculatorMock.calculate.mockReturnValue({
      severanceBase: 3000000,
      earnedTotal: 3360000,
      deductionsTotal: 0,
      netPay: 3360000,
      concepts: [
        {
          code: 'SEVERANCE',
          name: 'Cesantías',
          type: 'EARNING',
          amount: 3000000,
        },
        {
          code: 'SEVERANCE_INTEREST',
          name: 'Intereses de cesantías',
          type: 'EARNING',
          amount: 360000,
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

    expect(severancePayrollCalculatorMock.calculate).toHaveBeenCalledWith({
      baseSalary: 3000000,
      accruedDays: 360,
    });

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
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.SEVERANCE,
      status: PayrollStatus.CALCULATED,
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

    expect(prismaMock.payrollItem.create).not.toHaveBeenCalled();
  });

  it('should use service bonus payroll calculator for first semester bonus', async () => {
    prismaMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 6,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.DRAFT,
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 6,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.CALCULATED,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(180);

    serviceBonusPayrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: 1500000,
      deductionsTotal: 0,
      netPay: 1500000,
      concepts: [
        {
          code: 'SERVICE_BONUS',
          name: 'Prima de servicios',
          type: 'EARNING',
          amount: 1500000,
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

    expect(serviceBonusPayrollCalculatorMock.calculate).toHaveBeenCalledWith({
      baseSalary: 3000000,
      accruedDays: 180,
    });

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
    });

    prismaMock.payrollPeriod.update.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      year: 2026,
      month: 12,
      payrollType: PayrollType.BONUS,
      status: PayrollStatus.CALCULATED,
    });

    accruedDaysCalculatorMock.calculate.mockReturnValue(180);

    serviceBonusPayrollCalculatorMock.calculate.mockReturnValue({
      earnedTotal: 1500000,
      deductionsTotal: 0,
      netPay: 1500000,
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
    expect(prismaMock.payrollItem.create).not.toHaveBeenCalled();
  });
});
