import { Module } from '@nestjs/common';
import { PayrollModule } from '../payroll/payroll.module';
import { PayrollRulesModule } from '../payroll/rules/payroll-rules.module';
import { EmploymentTerminationsController } from './employment-terminations.controller';
import { EmploymentTerminationsService } from './employment-terminations.service';

@Module({
  imports: [PayrollModule, PayrollRulesModule],
  controllers: [EmploymentTerminationsController],
  providers: [EmploymentTerminationsService],
})
export class EmploymentTerminationsModule {}
