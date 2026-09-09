import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmploymentTerminationDto } from './dto/create-employment-termination.dto';

@Injectable()
export class EmploymentTerminationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    companyId: string,
    currentUserId: string,
    dto: CreateEmploymentTerminationDto,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        companyId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Colaborador no encontrado');
    }

    if (employee.status !== 'ACTIVE') {
      throw new BadRequestException(
        'No se puede registrar una terminación para un colaborador inactivo',
      );
    }

    const terminationDate = new Date(dto.terminationDate);

    if (terminationDate < employee.startDate) {
      throw new BadRequestException(
        'La fecha de terminación no puede ser anterior a la fecha de inicio del contrato',
      );
    }

    const existingTermination =
      await this.prisma.employmentTermination.findFirst({
        where: {
          companyId,
          employeeId: employee.id,
          status: {
            in: ['DRAFT', 'CALCULATED', 'APPROVED'],
          },
        },
      });

    if (existingTermination) {
      throw new BadRequestException(
        'El colaborador ya tiene un proceso de terminación activo',
      );
    }

    const termination = await this.prisma.employmentTermination.create({
      data: {
        companyId,
        employeeId: employee.id,
        terminationDate,
        reason: dto.reason,
        notes: dto.notes,
      },
      include: {
        employee: true,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CREATE_EMPLOYMENT_TERMINATION',
      entity: 'EmploymentTermination',
      entityId: termination.id,
      newValue: termination,
    });

    return termination;
  }

  async findAll(companyId: string, page = 1, limit = 20) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const where = {
      companyId,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employmentTermination.findMany({
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
      this.prisma.employmentTermination.count({
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
    const termination = await this.prisma.employmentTermination.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
      },
    });

    if (!termination) {
      throw new NotFoundException('Proceso de terminación no encontrado');
    }

    return termination;
  }
}
