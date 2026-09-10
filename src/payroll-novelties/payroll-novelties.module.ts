import { Module } from '@nestjs/common';
import { PayrollNoveltiesController } from './payroll-novelties.controller';
import { PayrollNoveltiesService } from './payroll-novelties.service';

@Module({
  controllers: [PayrollNoveltiesController],
  providers: [PayrollNoveltiesService],
})
export class PayrollNoveltiesModule {}
