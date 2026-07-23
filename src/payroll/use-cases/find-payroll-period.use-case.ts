import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FindPayrollPeriodUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(companyId: string, id: string) {
    const period = await this.prisma.payrollPeriod.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        items: {
          include: {
            employee: true,
            concepts: true,
          },
        },
      },
    });

    if (!period) {
      throw new NotFoundException('Periodo de nómina no encontrado');
    }

    return period;
  }
}