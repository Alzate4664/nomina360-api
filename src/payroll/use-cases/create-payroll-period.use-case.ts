import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrollPeriodDto } from '../dto/create-payroll-period.dto';
import { PayrollPeriodResponseDto } from '../dto/payroll-period-response.dto';

@Injectable()
export class CreatePayrollPeriodUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    dto: CreatePayrollPeriodDto,
  ): Promise<PayrollPeriodResponseDto> {
    const company = await this.prisma.company.findUnique({
      where: {
        id: dto.companyId,
      },
    });

    if (!company) {
      throw new BadRequestException('La empresa no existe.');
    }

    const existingPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId: dto.companyId,
        year: dto.year,
        month: dto.month,
        payrollType: dto.payrollType,
      },
    });

    if (existingPeriod) {
      throw new ConflictException(
        'Ya existe un período para esa empresa, año, mes y tipo de nómina.',
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : null;
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : null;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }

    if (startDate && paymentDate && paymentDate < startDate) {
      throw new BadRequestException(
        'La fecha de pago no puede ser anterior a la fecha inicial.',
      );
    }

    const payrollPeriod = await this.prisma.payrollPeriod.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        payrollType: dto.payrollType,
        year: dto.year,
        month: dto.month,
        startDate,
        endDate,
        paymentDate,
        status: PayrollStatus.DRAFT,
      },
    });

    return {
      id: payrollPeriod.id,
      companyId: payrollPeriod.companyId,
      name: payrollPeriod.name,
      payrollType: payrollPeriod.payrollType,
      year: payrollPeriod.year,
      month: payrollPeriod.month,
      status: payrollPeriod.status,
      startDate: payrollPeriod.startDate,
      endDate: payrollPeriod.endDate,
      paymentDate: payrollPeriod.paymentDate,
      createdAt: payrollPeriod.createdAt,
      updatedAt: payrollPeriod.updatedAt,
    };
  }
}
