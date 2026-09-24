import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrollPeriodDto } from '../dto/create-payroll-period.dto';
import { CreatePayrollPeriodUseCase } from './create-payroll-period.use-case';

describe('CreatePayrollPeriodUseCase', () => {
  let useCase: CreatePayrollPeriodUseCase;

  const txMock = {
    $executeRaw: jest.fn(),
    payrollPeriod: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const prismaMock = {
    company: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const baseDto: CreatePayrollPeriodDto = {
    name: 'Nómina Agosto 2026',
    payrollType: PayrollType.MONTHLY,
    year: 2026,
    month: 8,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    paymentDate: '2026-09-01',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatePayrollPeriodUseCase,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    useCase = module.get<CreatePayrollPeriodUseCase>(
      CreatePayrollPeriodUseCase,
    );

    prismaMock.company.findUnique.mockResolvedValue({
      id: 'company-1',
    });

    txMock.$executeRaw.mockResolvedValue(1);
    txMock.payrollPeriod.findFirst.mockResolvedValue(null);

    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof txMock) => Promise<unknown>): Promise<unknown> =>
        callback(txMock),
    );

    txMock.payrollPeriod.create.mockResolvedValue({
      id: 'period-1',
      companyId: 'company-1',
      name: baseDto.name,
      payrollType: PayrollType.MONTHLY,
      year: 2026,
      month: 8,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-31T00:00:00.000Z'),
      paymentDate: new Date('2026-09-01T00:00:00.000Z'),
      status: PayrollStatus.DRAFT,
      version: 0,
      createdById: null,
      approvedById: null,
      closedById: null,
      approvedAt: null,
      closedAt: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('should reject creation when company does not exist', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce(null);

    await expect(useCase.execute('company-1', baseDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    PayrollType.MONTHLY,
    PayrollType.SEMIMONTHLY,
    PayrollType.WEEKLY,
    PayrollType.BIWEEKLY,
  ])(
    'should require startDate and endDate for periodic payroll type %s',
    async (payrollType) => {
      const dto: CreatePayrollPeriodDto = {
        ...baseDto,
        payrollType,
        startDate: undefined,
        endDate: undefined,
      };

      await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it('should reject an incomplete interval', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      payrollType: PayrollType.EXTRAORDINARY,
      endDate: undefined,
    };

    await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject startDate after endDate', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      startDate: '2026-08-31',
      endDate: '2026-08-01',
    };

    await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject paymentDate before startDate', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      paymentDate: '2026-07-31',
    };

    await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject year that does not match startDate', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      year: 2025,
    };

    await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject month that does not match startDate', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      month: 7,
    };

    await expect(useCase.execute('company-1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('should reject an overlapping periodic payroll interval', async () => {
    txMock.payrollPeriod.findFirst.mockResolvedValueOnce({
      id: 'existing-period',
    });

    await expect(useCase.execute('company-1', baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(txMock.payrollPeriod.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        payrollType: PayrollType.MONTHLY,
        startDate: {
          lte: new Date('2026-08-31T00:00:00.000Z'),
        },
        endDate: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
        },
      },
      select: {
        id: true,
      },
    });

    expect(txMock.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it('should allow a non-overlapping semimonthly interval in the same month', async () => {
    const dto: CreatePayrollPeriodDto = {
      ...baseDto,
      name: 'Segunda quincena Agosto 2026',
      payrollType: PayrollType.SEMIMONTHLY,
      startDate: '2026-08-16',
      endDate: '2026-08-31',
    };

    await useCase.execute('company-1', dto);

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

    expect(txMock.payrollPeriod.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        payrollType: PayrollType.SEMIMONTHLY,
        startDate: {
          lte: new Date('2026-08-31T00:00:00.000Z'),
        },
        endDate: {
          gte: new Date('2026-08-16T00:00:00.000Z'),
        },
      },
      select: {
        id: true,
      },
    });

    expect(txMock.payrollPeriod.create).toHaveBeenCalledTimes(1);
  });

  it('should create a periodic payroll with normalized UTC dates', async () => {
    const result = await useCase.execute('company-1', baseDto);

    expect(txMock.payrollPeriod.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        name: 'Nómina Agosto 2026',
        payrollType: PayrollType.MONTHLY,
        year: 2026,
        month: 8,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        paymentDate: new Date('2026-09-01T00:00:00.000Z'),
        status: PayrollStatus.DRAFT,
      },
    });

    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);

    expect(result.id).toBe('period-1');
    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00.000Z'));
  });

  it('should allow extraordinary payroll without an interval', async () => {
    const dto: CreatePayrollPeriodDto = {
      name: 'Nómina extraordinaria',
      payrollType: PayrollType.EXTRAORDINARY,
      year: 2026,
      month: 8,
    };

    txMock.payrollPeriod.create.mockResolvedValueOnce({
      id: 'extraordinary-period',
      companyId: 'company-1',
      name: dto.name,
      payrollType: PayrollType.EXTRAORDINARY,
      year: 2026,
      month: 8,
      startDate: null,
      endDate: null,
      paymentDate: null,
      status: PayrollStatus.DRAFT,
      version: 0,
      createdById: null,
      approvedById: null,
      closedById: null,
      approvedAt: null,
      closedAt: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const result = await useCase.execute('company-1', dto);

    expect(txMock.payrollPeriod.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        name: 'Nómina extraordinaria',
        payrollType: PayrollType.EXTRAORDINARY,
        year: 2026,
        month: 8,
        startDate: null,
        endDate: null,
        paymentDate: null,
        status: PayrollStatus.DRAFT,
      },
    });

    expect(txMock.$executeRaw).not.toHaveBeenCalled();
    expect(txMock.payrollPeriod.findFirst).not.toHaveBeenCalled();

    expect(result.id).toBe('extraordinary-period');
  });
});
