import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NoveltyType, PayrollStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollNoveltyDto } from './dto/create-payroll-novelty.dto';

@Injectable()
export class PayrollNoveltiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    companyId: string,
    currentUserId: string,
    dto: CreatePayrollNoveltyDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        companyId,
        status: 'ACTIVE',
      },
    });

    if (!employee) {
      throw new NotFoundException('Colaborador no encontrado');
    }

    const payrollPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: dto.payrollPeriodId,
        companyId,
      },
    });

    if (!payrollPeriod) {
      throw new NotFoundException('Período de nómina no encontrado');
    }

    if (dto.type === NoveltyType.SICK_LEAVE) {
      if (!dto.sickLeaveOrigin) {
        throw new BadRequestException(
          'El origen de la incapacidad es obligatorio para novedades de incapacidad',
        );
      }

      if (!dto.sickLeaveStartDay) {
        throw new BadRequestException(
          'El día inicial de la incapacidad es obligatorio para novedades de incapacidad',
        );
      }

      if (!dto.sickLeaveIbc) {
        throw new BadRequestException(
          'El IBC de la incapacidad es obligatorio para novedades de incapacidad',
        );
      }
    }

    if (dto.type !== NoveltyType.SICK_LEAVE) {
      if (dto.sickLeaveOrigin || dto.sickLeaveStartDay || dto.sickLeaveIbc) {
        throw new BadRequestException(
          'Los datos de incapacidad solo aplican a novedades de incapacidad',
        );
      }
    }

    if (dto.type === NoveltyType.LEAVE) {
      if (!dto.leaveType) {
        throw new BadRequestException(
          'El tipo de licencia es obligatorio para novedades de licencia',
        );
      }
    }

    if (dto.type !== NoveltyType.LEAVE && dto.leaveType) {
      throw new BadRequestException(
        'El tipo de licencia solo aplica a novedades de licencia',
      );
    }

    const allowedStatuses: PayrollStatus[] = [
      PayrollStatus.DRAFT,
      PayrollStatus.COLLECTING_NOVELTIES,
      PayrollStatus.CALCULATED,
      PayrollStatus.REOPENED,
    ];

    if (!allowedStatuses.includes(payrollPeriod.status)) {
      throw new BadRequestException(
        `No se pueden registrar novedades en un período con estado ${payrollPeriod.status}`,
      );
    }

    const createdNovelty = await this.prisma.payrollNovelty.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        payrollPeriodId: payrollPeriod.id,
        type: dto.type,
        dayType: dto.dayType,
        sickLeaveOrigin: dto.sickLeaveOrigin,
        sickLeaveStartDay: dto.sickLeaveStartDay,
        sickLeaveIbc: dto.sickLeaveIbc,
        leaveType: dto.leaveType,
        quantity: dto.quantity,
        amount: dto.amount,
        description: dto.description,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CREATE_PAYROLL_NOVELTY',
      entity: 'PayrollNovelty',
      entityId: createdNovelty.id,
      newValue: createdNovelty,
    });

    return createdNovelty;

    if (dto.type === NoveltyType.LEAVE && !dto.leaveType) {
      throw new BadRequestException(
        'El tipo de licencia es obligatorio para novedades de licencia',
      );
    }

    if (dto.type !== NoveltyType.LEAVE && dto.leaveType) {
      throw new BadRequestException(
        'El tipo de licencia solo aplica a novedades de licencia',
      );
    }
  }

  async findAll(
    companyId: string,
    periodYear?: number,
    periodMonth?: number,
    page = 1,
    limit = 20,
    search?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const allowedTypes = [
      'OVERTIME',
      'OVERTIME_NIGHT',
      'NIGHT_SURCHARGE',
      'SUNDAY_SURCHARGE',
      'HOLIDAY_SURCHARGE',
      'BONUS',
      'DEDUCTION',
      'ABSENCE',
      'VACATION',
      'SICK_LEAVE',
      'LEAVE',
    ];

    const normalizedSearch = search?.trim();
    const normalizedType = normalizedSearch?.toUpperCase();

    const searchConditions: Prisma.PayrollNoveltyWhereInput[] = [];

    if (normalizedSearch) {
      searchConditions.push(
        {
          description: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
        {
          employee: {
            is: {
              OR: [
                {
                  firstName: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
                {
                  documentNumber: {
                    contains: normalizedSearch,
                    mode: 'insensitive',
                  },
                },
              ],
            },
          },
        },
      );

      if (normalizedType && allowedTypes.includes(normalizedType)) {
        searchConditions.push({
          type: normalizedType as NoveltyType,
        });
      }
    }

    const where = {
      companyId,
      ...(periodYear || periodMonth
        ? {
            payrollPeriod: {
              is: {
                ...(periodYear ? { year: periodYear } : {}),
                ...(periodMonth ? { month: periodMonth } : {}),
              },
            },
          }
        : {}),
      ...(searchConditions.length > 0
        ? {
            OR: searchConditions,
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollNovelty.findMany({
        where,
        include: {
          employee: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.payrollNovelty.count({
        where,
      }),
    ]);

    return {
      data,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async findOne(companyId: string, id: string) {
    const novelty = await this.prisma.payrollNovelty.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
      },
    });

    if (!novelty) {
      throw new NotFoundException('Novedad no encontrada');
    }

    return novelty;
  }

  async remove(companyId: string, id: string, currentUserId: string) {
    const novelty = await this.findOne(companyId, id);

    const deletedNovelty = await this.prisma.payrollNovelty.delete({
      where: {
        id: novelty.id,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'DELETE_PAYROLL_NOVELTY',
      entity: 'PayrollNovelty',
      entityId: deletedNovelty.id,
      oldValue: novelty,
    });

    return deletedNovelty;
  }
}
