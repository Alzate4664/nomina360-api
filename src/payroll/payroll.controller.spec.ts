import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';

describe('PayrollController', () => {
  let controller: PayrollController;

  const payrollServiceMock = {
    createPayrollPeriod: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    calculate: jest.fn(),
    approve: jest.fn(),
    close: jest.fn(),
    reopen: jest.fn(),
  };

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
    signAsync: jest.fn(),
    sign: jest.fn(),
  };

  beforeEach(async () => {
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
});
