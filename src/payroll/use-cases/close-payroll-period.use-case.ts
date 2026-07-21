import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    if (period.status === 'CLOSED') {
      throw new BadRequestException(
        'Este periodo de nómina ya se encuentra cerrado',
      );
    }

    if (period.status !== 'APPROVED') {
      throw new BadRequestException(
        'La nómina debe estar aprobada antes de cerrarse',
      );
    }

    const closedPeriod = await this.prisma.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: currentUserId,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'CLOSE_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: closedPeriod.id,
      oldValue: period,
      newValue: closedPeriod,
    });

    return closedPeriod;
  }
}
