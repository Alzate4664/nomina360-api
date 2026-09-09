import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmploymentTerminationDto } from './dto/create-employment-termination.dto';
import { EmployeeStatus, TerminationStatus } from '@prisma/client';
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

    const updatedTerminationId = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.employmentTermination.updateMany({
        where: {
          id: termination.id,
          companyId,
          version: termination.version,
          status: {
            in: allowedStatuses,
          },
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
          version: {
            increment: 1,
          },
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'La terminación cambió mientras se calculaba. Vuelve a cargarla e intenta nuevamente',
        );
      }

      await tx.employmentTerminationConcept.deleteMany({
        where: {
          employmentTerminationId: termination.id,
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
            version: termination.version,
            calculatedBaseSalary:
              termination.calculatedBaseSalary?.toString() ?? null,
            earnedTotal: termination.earnedTotal?.toString() ?? null,
            calculatedAt: termination.calculatedAt?.toISOString() ?? null,
          },
          newValue: {
            status: TerminationStatus.CALCULATED,
            version: termination.version + 1,
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

      return termination.id;
    });

    return this.prisma.employmentTermination.findFirst({
      where: {
        id: updatedTerminationId,
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

    const updatedTerminationId = await this.prisma.$transaction(async (tx) => {
      const transition = await tx.employmentTermination.updateMany({
        where: {
          id: termination.id,
          companyId,
          status: TerminationStatus.CALCULATED,
          version: termination.version,
        },
        data: {
          status: TerminationStatus.APPROVED,
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'La terminación cambió de estado y ya no puede aprobarse',
        );
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'APPROVE_EMPLOYMENT_TERMINATION',
          entity: 'EmploymentTermination',
          entityId: termination.id,
          oldValue: {
            status: TerminationStatus.CALCULATED,
            version: termination.version,
          },
          newValue: {
            status: TerminationStatus.APPROVED,
            version: termination.version,
          },
        },
        tx,
      );

      return termination.id;
    });

    return this.prisma.employmentTermination.findFirst({
      where: {
        id: updatedTerminationId,
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

  async close(companyId: string, currentUserId: string, id: string) {
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

    if (termination.status !== TerminationStatus.APPROVED) {
      throw new BadRequestException(
        `La terminación en estado ${termination.status} no puede cerrarse`,
      );
    }

    if (termination.employee.status !== EmployeeStatus.ACTIVE) {
      throw new BadRequestException(
        'El colaborador debe estar activo al momento de cerrar la terminación',
      );
    }

    const updatedTerminationId = await this.prisma.$transaction(async (tx) => {
      const terminationTransition = await tx.employmentTermination.updateMany({
        where: {
          id: termination.id,
          companyId,
          status: TerminationStatus.APPROVED,
        },
        data: {
          status: TerminationStatus.CLOSED,
        },
      });

      if (terminationTransition.count !== 1) {
        throw new BadRequestException(
          'La terminación cambió de estado y ya no puede cerrarse',
        );
      }

      const employeeTransition = await tx.employee.updateMany({
        where: {
          id: termination.employeeId,
          companyId,
          status: EmployeeStatus.ACTIVE,
        },
        data: {
          status: EmployeeStatus.INACTIVE,
        },
      });

      if (employeeTransition.count !== 1) {
        throw new BadRequestException(
          'El colaborador cambió de estado y la terminación no puede cerrarse',
        );
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CLOSE_EMPLOYMENT_TERMINATION',
          entity: 'EmploymentTermination',
          entityId: termination.id,
          oldValue: {
            status: TerminationStatus.APPROVED,
            version: termination.version,
            employeeStatus: EmployeeStatus.ACTIVE,
          },
          newValue: {
            status: TerminationStatus.CLOSED,
            version: termination.version,
            employeeStatus: EmployeeStatus.INACTIVE,
          },
        },
        tx,
      );

      return termination.id;
    });

    return this.prisma.employmentTermination.findFirst({
      where: {
        id: updatedTerminationId,
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
