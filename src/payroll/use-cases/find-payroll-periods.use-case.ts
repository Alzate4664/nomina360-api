import { BadRequestException, Injectable } from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FindPayrollPeriodsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    companyId: string,
    page = 1,
    limit = 20,
    year?: number,
    month?: number,
    status?: string,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const allowedStatuses: PayrollStatus[] = [
      PayrollStatus.DRAFT,
      PayrollStatus.CALCULATED,
      PayrollStatus.APPROVED,
    ];

    const normalizedStatus = status?.trim().toUpperCase();

    if (
      normalizedStatus &&
      !allowedStatuses.includes(normalizedStatus as PayrollStatus)
    ) {
      throw new BadRequestException('Estado de nómina no válido');
    }

    const where = {
      companyId,
      ...(year ? { year } : {}),
      ...(month ? { month } : {}),
      ...(normalizedStatus
        ? {
            status: normalizedStatus as PayrollStatus,
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollPeriod.findMany({
        where,
        orderBy: [
          {
            year: 'desc',
          },
          {
            month: 'desc',
          },
        ],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.payrollPeriod.count({
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
}
