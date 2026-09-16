import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReopenPayrollPeriodUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(
    companyId: string,
    currentUserId: string,
    payrollPeriodId: string,
  ) {
    const payrollPeriod = await this.prisma.payrollPeriod.findFirst({
      where: {
        id: payrollPeriodId,
        companyId,
      },
    });

    if (!payrollPeriod) {
      throw new NotFoundException('Período de nómina no encontrado.');
    }

    if (payrollPeriod.status !== PayrollStatus.CLOSED) {
      throw new BadRequestException(
        'Solo los períodos cerrados pueden reabrirse.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.payrollPeriod.updateMany({
        where: {
          id: payrollPeriod.id,
          companyId,
          status: PayrollStatus.CLOSED,
          version: payrollPeriod.version,
        },
        data: {
          status: PayrollStatus.REOPENED,
          closedAt: null,
          closedById: null,
          version: {
            increment: 1,
          },
        },
      });

      if (transition.count !== 1) {
        throw new BadRequestException(
          'El período de nómina cambió mientras se reabría. Vuelve a cargarlo e intenta nuevamente',
        );
      }

      const reopenedPayrollPeriod = await tx.payrollPeriod.findFirst({
        where: {
          id: payrollPeriod.id,
          companyId,
        },
      });

      if (!reopenedPayrollPeriod) {
        throw new NotFoundException('Período de nómina no encontrado.');
      }

      await this.auditService.log(
        {
          companyId,
          userId: currentUserId,
          action: 'REOPEN_PAYROLL',
          entity: 'PayrollPeriod',
          entityId: payrollPeriod.id,
          oldValue: {
            status: payrollPeriod.status,
            version: payrollPeriod.version,
            closedAt: payrollPeriod.closedAt,
            closedById: payrollPeriod.closedById,
          },
          newValue: {
            status: reopenedPayrollPeriod.status,
            version: reopenedPayrollPeriod.version,
            closedAt: reopenedPayrollPeriod.closedAt,
            closedById: reopenedPayrollPeriod.closedById,
          },
        },
        tx,
      );

      return reopenedPayrollPeriod;
    });
  }
}
