import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NoveltyType, PayrollStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollNoveltyDto } from './dto/create-payroll-novelty.dto';

const NOVELTY_MUTABLE_PERIOD_STATUSES: PayrollStatus[] = [
  PayrollStatus.DRAFT,
  PayrollStatus.COLLECTING_NOVELTIES,
  PayrollStatus.CALCULATED,
  PayrollStatus.REOPENED,
];

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

    this.assertPeriodAllowsNoveltyMutation(payrollPeriod.status);

    return this.prisma.$transaction(async (tx) => {
      await this.preparePeriodForNoveltyMutation(
        tx,
        companyId,
        currentUserId,
        payrollPeriod,
      );

      const createdNovelty = await tx.payrollNovelty.create({
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

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CREATE_PAYROLL_NOVELTY',
          entity: 'PayrollNovelty',
          entityId: createdNovelty.id,
          newValue: createdNovelty,
        },
        tx,
      );

      return createdNovelty;
    });
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

    const payrollPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: novelty.payrollPeriodId,
        companyId,
      },
    });

    if (!payrollPeriod) {
      throw new NotFoundException('Período de nómina no encontrado');
    }

    this.assertPeriodAllowsNoveltyMutation(payrollPeriod.status);

    return this.prisma.$transaction(async (tx) => {
      await this.preparePeriodForNoveltyMutation(
        tx,
        companyId,
        currentUserId,
        payrollPeriod,
      );

      const deletedNovelty = await tx.payrollNovelty.delete({
        where: {
          id: novelty.id,
        },
      });

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'DELETE_PAYROLL_NOVELTY',
          entity: 'PayrollNovelty',
          entityId: deletedNovelty.id,
          oldValue: novelty,
        },
        tx,
      );

      return deletedNovelty;
    });
  }

  private assertPeriodAllowsNoveltyMutation(status: PayrollStatus) {
    if (!NOVELTY_MUTABLE_PERIOD_STATUSES.includes(status)) {
      throw new BadRequestException(
        `No se pueden modificar novedades en un período con estado ${status}`,
      );
    }
  }

  private async preparePeriodForNoveltyMutation(
    tx: Prisma.TransactionClient,
    companyId: string,
    currentUserId: string,
    payrollPeriod: {
      id: string;
      status: PayrollStatus;
      version: number;
    },
  ) {
    const transition = await tx.payrollPeriod.updateMany({
      where: {
        id: payrollPeriod.id,
        companyId,
        version: payrollPeriod.version,
        status: {
          in: NOVELTY_MUTABLE_PERIOD_STATUSES,
        },
      },
      data: {
        status: PayrollStatus.COLLECTING_NOVELTIES,
        version: {
          increment: 1,
        },
      },
    });

    if (transition.count !== 1) {
      throw new ConflictException(
        'El período de nómina cambió mientras se modificaban sus novedades. Vuelve a cargarlo e intenta nuevamente',
      );
    }

    const payrollItems = await tx.payrollItem.findMany({
      where: {
        companyId,
        payrollPeriodId: payrollPeriod.id,
      },
      select: {
        id: true,
      },
    });

    const payrollItemIds = payrollItems.map((item) => item.id);

    if (payrollItemIds.length > 0) {
      await tx.payrollConceptDetail.deleteMany({
        where: {
          payrollItemId: {
            in: payrollItemIds,
          },
        },
      });

      await tx.payrollItem.deleteMany({
        where: {
          id: {
            in: payrollItemIds,
          },
          companyId,
          payrollPeriodId: payrollPeriod.id,
        },
      });
    }

    await this.auditService.log(
      {
        companyId,
        userId: currentUserId,
        action: 'PREPARE_PAYROLL_FOR_NOVELTY_CHANGE',
        entity: 'PayrollPeriod',
        entityId: payrollPeriod.id,
        oldValue: {
          status: payrollPeriod.status,
          version: payrollPeriod.version,
        },
        newValue: {
          status: PayrollStatus.COLLECTING_NOVELTIES,
          version: payrollPeriod.version + 1,
        },
      },
      tx,
    );
  }
}
