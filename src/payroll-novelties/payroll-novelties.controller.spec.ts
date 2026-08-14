import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollNoveltiesController } from './payroll-novelties.controller';
import { PayrollNoveltiesService } from './payroll-novelties.service';

describe('PayrollNoveltiesController', () => {
  let controller: PayrollNoveltiesController;

  const payrollNoveltiesServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const jwtServiceMock = {
    verifyAsync: jest.fn(),
    signAsync: jest.fn(),
    sign: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayrollNoveltiesController],
      providers: [
        {
          provide: PayrollNoveltiesService,
          useValue: payrollNoveltiesServiceMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
      ],
    }).compile();

    controller = module.get<PayrollNoveltiesController>(
      PayrollNoveltiesController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
