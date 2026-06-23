import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    const allowedTypes = [
      'OVERTIME',
      'NIGHT_SURCHARGE',
      'SUNDAY_SURCHARGE',
      'HOLIDAY_SURCHARGE',
      'BONUS',
      'DEDUCTION',
      'ABSENCE',
      'VACATION',
      'SICK_LEAVE',
    ];

    if (!allowedTypes.includes(dto.type)) {
      throw new BadRequestException('Tipo de novedad no válido');
    }

    const createdNovelty = await this.prisma.payrollNovelty.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        type: dto.type as any,
        quantity: dto.quantity,
        amount: dto.amount,
        description: dto.description,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
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
      'NIGHT_SURCHARGE',
      'SUNDAY_SURCHARGE',
      'HOLIDAY_SURCHARGE',
      'BONUS',
      'DEDUCTION',
      'ABSENCE',
      'VACATION',
      'SICK_LEAVE',
    ];

    const normalizedSearch = search?.trim();
    const normalizedType = normalizedSearch?.toUpperCase();

    const searchConditions: any[] = [];

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
          type: normalizedType as any,
        });
      }
    }

    const where = {
      companyId,
      ...(periodYear ? { periodYear } : {}),
      ...(periodMonth ? { periodMonth } : {}),
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