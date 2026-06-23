import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        service: 'nomina360-api',
        database: 'connected',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'nomina360-api',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
