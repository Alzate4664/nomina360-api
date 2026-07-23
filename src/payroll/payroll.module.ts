import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { CreatePayrollPeriodUseCase } from './use-cases/create-payroll-period.use-case';
import { ClosePayrollPeriodUseCase } from './use-cases/close-payroll-period.use-case';
import { FindPayrollPeriodsUseCase } from './use-cases/find-payroll-periods.use-case';
import { ApprovePayrollPeriodUseCase } from './use-cases/approve-payroll-period.use-case';
import { CalculatePayrollUseCase } from './use-cases/calculate-payroll.use-case';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayrollCalculatorService,
    CreatePayrollPeriodUseCase,
    FindPayrollPeriodsUseCase,
    CalculatePayrollUseCase,
    ApprovePayrollPeriodUseCase,
    ClosePayrollPeriodUseCase,
  ],
})
export class PayrollModule {}
