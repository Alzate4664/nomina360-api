import { JwtService } from '@nestjs/jwt';
import { PayrollType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

describe('PayrollController', () => {
  let controller: PayrollController;

  const payrollServiceMock = {
    createPayrollPeriod: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    calculatePayroll: jest.fn(),
    calculatePayrollLegacy: jest.fn(),
    approvePayroll: jest.fn(),
    closePayroll: jest.fn(),
    reopenPayroll: jest.fn(),
  };

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
    signAsync: jest.fn(),
    sign: jest.fn(),
  };

  const user = {
    companyId: 'company-1',
    sub: 'user-1',
  } as AuthenticatedUser;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollController],
      providers: [
        {
          provide: PayrollService,
          useValue: payrollServiceMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
      ],
    }).compile();

    controller = module.get<PayrollController>(PayrollController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should calculate a payroll period by canonical period id', async () => {
    payrollServiceMock.calculatePayroll.mockResolvedValue({
      id: 'period-1',
    });

    const result = await controller.calculate(user, 'period-1');

    expect(payrollServiceMock.calculatePayroll).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      'period-1',
    );

    expect(payrollServiceMock.calculatePayrollLegacy).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'period-1' });
  });

  it('should preserve the legacy year-month-type calculation contract', async () => {
    payrollServiceMock.calculatePayrollLegacy.mockResolvedValue({
      id: 'period-1',
    });

    const dto = {
      year: 2026,
      month: 12,
      payrollType: PayrollType.MONTHLY,
    };

    const result = await controller.calculateLegacy(user, dto);

    expect(payrollServiceMock.calculatePayrollLegacy).toHaveBeenCalledWith(
      'company-1',
      'user-1',
      2026,
      12,
      PayrollType.MONTHLY,
    );

    expect(payrollServiceMock.calculatePayroll).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'period-1' });
  });
});
