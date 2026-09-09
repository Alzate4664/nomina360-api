import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PayrollModule } from '../payroll/payroll.module';
import { EmploymentTerminationsController } from './employment-terminations.controller';
import { EmploymentTerminationsService } from './employment-terminations.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret',
      signOptions: {
        expiresIn: '1d',
      },
    }),
    PayrollModule,
  ],
  controllers: [EmploymentTerminationsController],
  providers: [EmploymentTerminationsService],
})
export class EmploymentTerminationsModule {}
