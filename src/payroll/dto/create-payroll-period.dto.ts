import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { PayrollType } from '@prisma/client';

export class CreatePayrollPeriodDto {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsEnum(PayrollType)
  payrollType!: PayrollType;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}
