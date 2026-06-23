import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { EmployeesModule } from './employees/employees.module';
import { PayrollNoveltiesModule } from './payroll-novelties/payroll-novelties.module';
import { PayrollModule } from './payroll/payroll.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    HealthModule,PrismaModule, AuthModule, CompaniesModule, EmployeesModule, PayrollNoveltiesModule, PayrollModule, ReportsModule, UsersModule, AuditModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

