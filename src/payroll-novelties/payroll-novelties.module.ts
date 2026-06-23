import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PayrollNoveltiesController } from './payroll-novelties.controller';
import { PayrollNoveltiesService } from './payroll-novelties.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev_secret',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],
  controllers: [PayrollNoveltiesController],
  providers: [PayrollNoveltiesService],
})
export class PayrollNoveltiesModule {}