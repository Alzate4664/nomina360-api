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
export class ClosePayrollPeriodUseCase {
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

    if (period.status === PayrollStatus.CLOSED) {
      throw new BadRequestException(
        'Este periodo de nómina ya se encuentra cerrado',
      );
    }

    if (period.status !== PayrollStatus.APPROVED) {
      throw new BadRequestException(
        'La nómina debe estar aprobada antes de cerrarse',
      );
    }

    const closedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.payrollPeriod.updateMany({
        where: {
          id: period.id,
          companyId,
          status: PayrollStatus.APPROVED,
          version: period.version,
        },
        data: {
          status: PayrollStatus.CLOSED,
          closedAt,
          closedById: currentUserId,
          version: {
            increment: 1,
          },
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'El período de nómina cambió mientras se cerraba. Vuelve a cargarlo e intenta nuevamente',
        );
      }

      const closedPeriod = await tx.payrollPeriod.findFirst({
        where: {
          id: period.id,
          companyId,
        },
      });

      if (!closedPeriod) {
        throw new NotFoundException('Periodo de nómina no encontrado');
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'CLOSE_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: closedPeriod.id,
          oldValue: period,
          newValue: closedPeriod,
        },
        tx,
      );

      return closedPeriod;
    });
  }
}
