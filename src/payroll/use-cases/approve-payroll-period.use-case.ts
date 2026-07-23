import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    if (period.status === 'APPROVED') {
      throw new BadRequestException('Este periodo ya fue aprobado');
    }

    if (period.status !== 'CALCULATED') {
      throw new BadRequestException(
        'La nómina debe estar calculada antes de aprobarse',
      );
    }

    const approvedPeriod = await this.prisma.payrollPeriod.update({
      where: {
        id: period.id,
      },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: currentUserId,
      },
    });

    await this.auditService.log({
      companyId,
      userId: currentUserId,
      action: 'APPROVE_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: approvedPeriod.id,
      oldValue: period,
      newValue: approvedPeriod,
    });

    return approvedPeriod;
  }
}