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

    const reopenedPayrollPeriod = await this.prisma.payrollPeriod.update({
      where: {
        id: payrollPeriod.id,
      },
      data: {
        status: PayrollStatus.REOPENED,
        closedAt: null,
        closedById: null,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'REOPEN_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: payrollPeriod.id,
      oldValue: {
        status: payrollPeriod.status,
        closedAt: payrollPeriod.closedAt,
        closedById: payrollPeriod.closedById,
      },
      newValue: {
        status: reopenedPayrollPeriod.status,
        closedAt: reopenedPayrollPeriod.closedAt,
        closedById: reopenedPayrollPeriod.closedById,
      },
    });

    return reopenedPayrollPeriod;
  }
}
