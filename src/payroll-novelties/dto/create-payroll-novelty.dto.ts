import { NoveltyType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePayrollNoveltyDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  payrollPeriodId!: string;

  @IsEnum(NoveltyType)
  type!: NoveltyType;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;
}