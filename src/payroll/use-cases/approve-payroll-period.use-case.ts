import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollPeriodResponseDto } from '../dto/payroll-period-response.dto';

@Injectable()
export class ApprovePayrollPeriodUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    companyId: string,
    currentUserId: string,
    id: string,
  ): Promise<PayrollPeriodResponseDto> {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        companyId,
      },
    });

    if (!period) {
      throw new NotFoundException('Periodo de nómina no encontrado');
    }

    if (period.status === PayrollStatus.APPROVED) {
      throw new BadRequestException('Este periodo ya fue aprobado');
    }

    if (period.status !== PayrollStatus.CALCULATED) {
      throw new BadRequestException(
        'La nómina debe estar calculada antes de aprobarse',
      );
    }

    const approvedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.payrollPeriod.updateMany({
        where: {
          id: period.id,
          companyId,
          status: PayrollStatus.CALCULATED,
          version: period.version,
        },
        data: {
          status: PayrollStatus.APPROVED,
          approvedAt,
          approvedById: currentUserId,
          version: {
            increment: 1,
          },
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'El período de nómina cambió mientras se aprobaba. Vuelve a cargarlo e intenta nuevamente',
        );
      }

      const approvedPeriod = await tx.payrollPeriod.findFirst({
        where: {
          id: period.id,
          companyId,
        },
      });

      if (!approvedPeriod) {
        throw new NotFoundException('Periodo de nómina no encontrado');
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'APPROVE_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: approvedPeriod.id,
          oldValue: period,
          newValue: approvedPeriod,
        },
        tx,
      );

      return approvedPeriod;
    });
  }
}
