import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PayrollStatus, PayrollType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayrollPeriodDto } from '../dto/create-payroll-period.dto';
import { PayrollPeriodResponseDto } from '../dto/payroll-period-response.dto';

const PERIODIC_PAYROLL_TYPES = new Set<PayrollType>([
  PayrollType.MONTHLY,
  PayrollType.SEMIMONTHLY,
  PayrollType.WEEKLY,
  PayrollType.BIWEEKLY,
]);

type ParsedPayrollPeriodDates = {
  startDate: Date | null;
  endDate: Date | null;
  paymentDate: Date | null;
};

@Injectable()
export class CreatePayrollPeriodUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    companyId: string,
    dto: CreatePayrollPeriodDto,
  ): Promise<PayrollPeriodResponseDto> {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new BadRequestException('La empresa no existe.');
    }

    const { startDate, endDate, paymentDate } =
      this.validateTemporalSemantics(dto);

    const existingPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        companyId,
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

    const payrollPeriod = await this.prisma.payrollPeriod.create({
      data: {
        companyId,
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

  private validateTemporalSemantics(
    dto: CreatePayrollPeriodDto,
  ): ParsedPayrollPeriodDates {
    const hasStartDate = dto.startDate !== undefined;
    const hasEndDate = dto.endDate !== undefined;
    const requiresInterval = PERIODIC_PAYROLL_TYPES.has(dto.payrollType);

    if (requiresInterval && (!hasStartDate || !hasEndDate)) {
      throw new BadRequestException(
        `El tipo de nómina ${dto.payrollType} requiere startDate y endDate.`,
      );
    }

    if (hasStartDate !== hasEndDate) {
      throw new BadRequestException(
        'startDate y endDate deben enviarse juntos.',
      );
    }

    const startDate = dto.startDate
      ? this.parseDateOnly(dto.startDate, 'startDate')
      : null;

    const endDate = dto.endDate
      ? this.parseDateOnly(dto.endDate, 'endDate')
      : null;

    const paymentDate = dto.paymentDate
      ? this.parseDateOnly(dto.paymentDate, 'paymentDate')
      : null;

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }

    if (
      startDate &&
      (startDate.getUTCFullYear() !== dto.year ||
        startDate.getUTCMonth() + 1 !== dto.month)
    ) {
      throw new BadRequestException(
        'El año y el mes deben corresponder a la fecha inicial del período.',
      );
    }

    if (startDate && paymentDate && paymentDate < startDate) {
      throw new BadRequestException(
        'La fecha de pago no puede ser anterior a la fecha inicial.',
      );
    }

    return {
      startDate,
      endDate,
      paymentDate,
    };
  }

  private parseDateOnly(value: string, fieldName: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

    if (!match) {
      throw new BadRequestException(
        `${fieldName} debe tener formato YYYY-MM-DD.`,
      );
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${fieldName} no es una fecha válida.`);
    }

    return date;
  }
}
