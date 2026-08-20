import {
  LeaveType,
  NoveltyType,
  PayrollDayType,
  SickLeaveOrigin,
} from '@prisma/client';
import {
  IsInt,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePayrollNoveltyDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  payrollPeriodId!: string;

  @IsEnum(NoveltyType)
  type!: NoveltyType;

  @IsOptional()
  @IsEnum(PayrollDayType)
  dayType?: PayrollDayType;

  @IsOptional()
  @IsEnum(SickLeaveOrigin)
  sickLeaveOrigin?: SickLeaveOrigin;

  @IsOptional()
  @IsInt()
  @Min(1)
  sickLeaveStartDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  sickLeaveIbc?: number;

  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

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
