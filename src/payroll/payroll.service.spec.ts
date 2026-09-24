import { PayrollType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollService } from './payroll.service';
import { ApprovePayrollPeriodUseCase } from './use-cases/approve-payroll-period.use-case';
import { CalculatePayrollUseCase } from './use-cases/calculate-payroll.use-case';
import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';
import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';
import { FindPayrollPeriodUseCase } from './use-cases/find-payroll-period.use-case';
import { FindPayrollPeriodsUseCase } from './use-cases/find-payroll-periods.use-case';
import { ReopenPayrollPeriodUseCase } from './use-cases/reopen-payroll-period.use-case';

describe('PayrollService', () => {
  let service: PayrollService;

  const createPayrollPeriodUseCaseMock = {
    execute: jest.fn(),
  };

  const findPayrollPeriodsUseCaseMock = {
    execute: jest.fn(),
  };

  const findPayrollPeriodUseCaseMock = {
    execute: jest.fn(),
  };

  const calculatePayrollUseCaseMock = {
    execute: jest.fn(),
    executeLegacy: jest.fn(),
  };

  const approvePayrollPeriodUseCaseMock = {
    execute: jest.fn(),
  };

  const closePayrollPeriodUseCaseMock = {
    execute: jest.fn(),
  };

  const reopenPayrollPeriodUseCaseMock = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: CreatePayrollPeriodUseCase,
          useValue: createPayrollPeriodUseCaseMock,
        },
        {
          provide: FindPayrollPeriodsUseCase,
          useValue: findPayrollPeriodsUseCaseMock,
        },
        {
          provide: FindPayrollPeriodUseCase,
          useValue: findPayrollPeriodUseCaseMock,
        },
        {
          provide: CalculatePayrollUseCase,
          useValue: calculatePayrollUseCaseMock,
        },
        {
          provide: ApprovePayrollPeriodUseCase,
          useValue: approvePayrollPeriodUseCaseMock,
        },
        {
          provide: ClosePayrollPeriodUseCase,
          useValue: closePayrollPeriodUseCaseMock,
        },
        {
          provide: ReopenPayrollPeriodUseCase,
          useValue: reopenPayrollPeriodUseCaseMock,
        },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate a payroll period using its canonical id', async () => {
    calculatePayrollUseCaseMock.execute.mockResolvedValue('period-1');
    findPayrollPeriodUseCaseMock.execute.mockResolvedValue({
      id: 'period-1',
    });

    const result = await service.calculatePayroll(
      'company-1',
      'user-1',
      'period-1',
    );

    expect(calculatePayrollUseCaseMock.execute).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'period-1',
    );

    expect(findPayrollPeriodUseCaseMock.execute).toHaveBeenCalledWith(
      'company-1',
      'period-1',
    );

    expect(calculatePayrollUseCaseMock.executeLegacy).not.toHaveBeenCalled();

    expect(result).toEqual({
      id: 'period-1',
    });
  });

  it('should preserve the legacy year-month-type calculation flow', async () => {
    calculatePayrollUseCaseMock.executeLegacy.mockResolvedValue('period-1');
    findPayrollPeriodUseCaseMock.execute.mockResolvedValue({
      id: 'period-1',
    });

    const result = await service.calculatePayrollLegacy(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.MONTHLY,
    );

    expect(calculatePayrollUseCaseMock.executeLegacy).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.MONTHLY,
    );

    expect(findPayrollPeriodUseCaseMock.execute).toHaveBeenCalledWith(
      'company-1',
      'period-1',
    );

    expect(calculatePayrollUseCaseMock.execute).not.toHaveBeenCalled();

    expect(result).toEqual({
      id: 'period-1',
    });
  });
});
