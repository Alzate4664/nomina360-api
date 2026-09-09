import { Test, TestingModule } from '@nestjs/testing';
import { TerminationReason } from '@prisma/client';
import { EmploymentTerminationsController } from './employment-terminations.controller';
import { EmploymentTerminationsService } from './employment-terminations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('EmploymentTerminationsController', () => {
  let controller: EmploymentTerminationsController;

  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    calculate: jest.fn(),
  };

  const user = {
    sub: 'user-1',
    companyId: 'company-1',
    role: 'OWNER',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmploymentTerminationsController],
      providers: [
        {
          provide: EmploymentTerminationsService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .compile();

    controller = module.get<EmploymentTerminationsController>(
      EmploymentTerminationsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create an employment termination using authenticated user context', async () => {
    const dto = {
      employeeId: 'employee-1',
      terminationDate: '2026-09-08',
      reason: TerminationReason.RESIGNATION,
      notes: 'Retiro voluntario',
    };

    const expected = {
      id: 'termination-1',
      ...dto,
    };

    service.create.mockResolvedValue(expected);

    const result = await controller.create(user as any, dto);

    expect(service.create).toHaveBeenCalledWith(user.companyId, user.sub, dto);

    expect(result).toEqual(expected);
  });

  it('should calculate an employment termination using authenticated user context', async () => {
    const dto = {
      unpaidSalaryStartDate: '2026-09-01',
      pendingVacationDays: 7.5,
    };

    const expected = {
      id: 'termination-1',
      status: 'CALCULATED',
    };

    service.calculate.mockResolvedValue(expected);

    const result = await controller.calculate(
      user as any,
      'termination-1',
      dto,
    );

    expect(service.calculate).toHaveBeenCalledWith(
      user.companyId,
      user.sub,
      'termination-1',
      dto,
    );

    expect(result).toEqual(expected);
  });

  it('should list employment terminations using company from authenticated user', async () => {
    service.findAll.mockResolvedValue({
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });

    const result = await controller.findAll(user as any, undefined, undefined);

    expect(service.findAll).toHaveBeenCalledWith(user.companyId, 1, 20);

    expect(result.data).toEqual([]);
  });

  it('should find one employment termination using company isolation', async () => {
    const expected = {
      id: 'termination-1',
      companyId: user.companyId,
    };

    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(user as any, 'termination-1');

    expect(service.findOne).toHaveBeenCalledWith(
      user.companyId,
      'termination-1',
    );

    expect(result).toEqual(expected);
  });
});
