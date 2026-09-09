import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmploymentTerminationDto } from './dto/create-employment-termination.dto';
import { TerminationStatus } from '@prisma/client';
import { TerminationPayrollCalculator } from '../payroll/calculator/termination-payroll.calculator';
import { CalculateEmploymentTerminationDto } from './dto/calculate-employment-termination.dto';

@Injectable()
export class EmploymentTerminationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly terminationPayrollCalculator: TerminationPayrollCalculator,
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

  async calculate(
    companyId: string,
    currentUserId: string,
    id: string,
    dto: CalculateEmploymentTerminationDto,
  ) {
    const termination = await this.prisma.employmentTermination.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
        concepts: true,
      },
    });

    if (!termination) {
      throw new NotFoundException('Proceso de terminación no encontrado');
    }

    const allowedStatuses: TerminationStatus[] = [
      TerminationStatus.DRAFT,
      TerminationStatus.CALCULATED,
    ];

    if (!allowedStatuses.includes(termination.status)) {
      throw new BadRequestException(
        `La terminación en estado ${termination.status} no puede calcularse ni recalcularse`,
      );
    }

    const unpaidSalaryStartDate = new Date(dto.unpaidSalaryStartDate);

    if (unpaidSalaryStartDate < termination.employee.startDate) {
      throw new BadRequestException(
        'La fecha inicial del salario pendiente no puede ser anterior a la fecha de inicio del contrato',
      );
    }

    if (unpaidSalaryStartDate > termination.terminationDate) {
      throw new BadRequestException(
        'La fecha inicial del salario pendiente no puede ser posterior a la fecha de terminación',
      );
    }

    const pendingVacationDays = dto.pendingVacationDays ?? 0;

    const calculation = this.terminationPayrollCalculator.calculate({
      baseSalary: Number(termination.employee.baseSalary),
      employeeStartDate: termination.employee.startDate,
      terminationDate: termination.terminationDate,
      unpaidSalaryStartDate,
      pendingVacationDays,
    });

    const calculatedAt = new Date();

    const updatedTermination = await this.prisma.$transaction(async (tx) => {
      await tx.employmentTerminationConcept.deleteMany({
        where: {
          employmentTerminationId: termination.id,
        },
      });

      const updated = await tx.employmentTermination.update({
        where: {
          id: termination.id,
        },
        data: {
          unpaidSalaryStartDate,
          pendingVacationDays,
          calculatedBaseSalary: Number(termination.employee.baseSalary),
          salaryDays: calculation.salaryDays,
          severanceDays: calculation.severanceDays,
          serviceBonusDays: calculation.serviceBonusDays,
          earnedTotal: calculation.earnedTotal,
          calculatedAt,
          status: TerminationStatus.CALCULATED,
        },
      });

      if (calculation.concepts.length > 0) {
        await tx.employmentTerminationConcept.createMany({
          data: calculation.concepts.map((concept) => ({
            employmentTerminationId: termination.id,
            conceptCode: concept.code,
            conceptName: concept.name,
            type: concept.type,
            amount: concept.amount,
          })),
        });
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CALCULATE_EMPLOYMENT_TERMINATION',
          entity: 'EmploymentTermination',
          entityId: termination.id,
          oldValue: {
            status: termination.status,
            calculatedBaseSalary:
              termination.calculatedBaseSalary?.toString() ?? null,
            earnedTotal: termination.earnedTotal?.toString() ?? null,
            calculatedAt: termination.calculatedAt?.toISOString() ?? null,
          },
          newValue: {
            status: TerminationStatus.CALCULATED,
            calculatedBaseSalary: Number(termination.employee.baseSalary),
            salaryDays: calculation.salaryDays,
            severanceDays: calculation.severanceDays,
            serviceBonusDays: calculation.serviceBonusDays,
            pendingVacationDays,
            earnedTotal: calculation.earnedTotal,
            calculatedAt: calculatedAt.toISOString(),
          },
        },
        tx,
      );

      return updated;
    });

    return this.prisma.employmentTermination.findFirst({
      where: {
        id: updatedTermination.id,
        companyId,
      },
      include: {
        employee: true,
        concepts: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async approve(companyId: string, currentUserId: string, id: string) {
    const termination = await this.prisma.employmentTermination.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        employee: true,
        concepts: true,
      },
    });

    if (!termination) {
      throw new NotFoundException('Proceso de terminación no encontrado');
    }

    if (termination.status !== TerminationStatus.CALCULATED) {
      throw new BadRequestException(
        `La terminación en estado ${termination.status} no puede aprobarse`,
      );
    }

    if (
      termination.calculatedBaseSalary === null ||
      termination.earnedTotal === null ||
      termination.calculatedAt === null
    ) {
      throw new BadRequestException(
        'La terminación no tiene un cálculo válido para aprobar',
      );
    }

    const updatedTermination = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employmentTermination.update({
        where: {
          id: termination.id,
        },
        data: {
          status: TerminationStatus.APPROVED,
        },
      });

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'APPROVE_EMPLOYMENT_TERMINATION',
          entity: 'EmploymentTermination',
          entityId: termination.id,
          oldValue: {
            status: termination.status,
          },
          newValue: {
            status: TerminationStatus.APPROVED,
          },
        },
        tx,
      );

      return updated;
    });

    return this.prisma.employmentTermination.findFirst({
      where: {
        id: updatedTermination.id,
        companyId,
      },
      include: {
        employee: true,
        concepts: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
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
