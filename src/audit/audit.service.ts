import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateAuditLogInput {
  companyId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    data: CreateAuditLogInput,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.auditLog.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        oldValue: data.oldValue,
        newValue: data.newValue,
      },
    });
  }

  async findAll(
    companyId: string,
    action?: string,
    entity?: string,
    userId?: string,
    page = 1,
    limit = 20,
  ) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const where = {
      companyId,
      ...(action ? { action } : {}),
      ...(entity ? { entity } : {}),
      ...(userId ? { userId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({
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
