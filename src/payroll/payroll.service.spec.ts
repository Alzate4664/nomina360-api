import { Test, TestingModule } from '@nestjs/testing';
import { ApprovePayrollPeriodUseCase } from './use-cases/approve-payroll-period.use-case';
import { CalculatePayrollUseCase } from './use-cases/calculate-payroll.use-case';
import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';
import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';
import { FindPayrollPeriodUseCase } from './use-cases/find-payroll-period.use-case';
import { FindPayrollPeriodsUseCase } from './use-cases/find-payroll-periods.use-case';
import { ReopenPayrollPeriodUseCase } from './use-cases/reopen-payroll-period.use-case';
import { PayrollService } from './payroll.service';

describe('PayrollService', () => {
  let service: PayrollService;

  const useCaseMock = {
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        {
          provide: CreatePayrollPeriodUseCase,
          useValue: useCaseMock,
        },
        {
          provide: FindPayrollPeriodsUseCase,
          useValue: useCaseMock,
        },
        {
          provide: FindPayrollPeriodUseCase,
          useValue: useCaseMock,
        },
        {
          provide: CalculatePayrollUseCase,
          useValue: useCaseMock,
        },
        {
          provide: ApprovePayrollPeriodUseCase,
          useValue: useCaseMock,
        },
        {
          provide: ClosePayrollPeriodUseCase,
          useValue: useCaseMock,
        },
        {
          provide: ReopenPayrollPeriodUseCase,
          useValue: useCaseMock,
        },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
