import { Module } from '@nestjs/common';
import { PayrollModule } from '../payroll/payroll.module';
import { EmploymentTerminationsController } from './employment-terminations.controller';
import { EmploymentTerminationsService } from './employment-terminations.service';

@Module({
  imports: [PayrollModule],
  controllers: [EmploymentTerminationsController],
  providers: [EmploymentTerminationsService],
})
export class EmploymentTerminationsModule {}
