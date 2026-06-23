import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    companyId: string,
    currentUserId: string,
    dto: CreateEmployeeDto,
  ) {
    const existingEmployee = await this.prisma.employee.findFirst({
      where: {
        companyId,
        documentNumber: dto.documentNumber,
      },
    });

    if (existingEmployee) {
      throw new BadRequestException(
        'Ya existe un colaborador con este número de documento',
      );
    }

    const createdEmployee = await this.prisma.employee.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber,
        email: dto.email,
        phone: dto.phone,
        position: dto.position,
        department: dto.department,
        contractType: dto.contractType,
        baseSalary: dto.baseSalary,
        startDate: new Date(dto.startDate),
        eps: dto.eps,
        pensionFund: dto.pensionFund,
        arl: dto.arl,
        compensationBox: dto.compensationBox,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CREATE_EMPLOYEE',
      entity: 'Employee',
      entityId: createdEmployee.id,
      newValue: createdEmployee,
    });

    return createdEmployee;
  }

  async findAll(
  companyId: string,
  page = 1,
  limit = 20,
  search?: string,
  ) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const where = {
    companyId,
    status: 'ACTIVE' as const,
    ...(search
      ? {
          OR: [
            {
              firstName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              lastName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              documentNumber: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              email: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              position: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              department: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {}),
  };

  const [data, total] = await this.prisma.$transaction([
    this.prisma.employee.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    this.prisma.employee.count({
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
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!employee) {
      throw new NotFoundException('Colaborador no encontrado');
    }

    return employee;
  }

  async remove(companyId: string, id: string, currentUserId: string) {
    const employee = await this.findOne(companyId, id);

    const deactivatedEmployee = await this.prisma.employee.update({
      where: {
        id: employee.id,
      },
      data: {
        status: 'INACTIVE',
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'DEACTIVATE_EMPLOYEE',
      entity: 'Employee',
      entityId: deactivatedEmployee.id,
      oldValue: employee,
      newValue: deactivatedEmployee,
    });

    return deactivatedEmployee;
  }
}