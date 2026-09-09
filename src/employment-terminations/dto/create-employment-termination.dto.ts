import { TerminationReason } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateEmploymentTerminationDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  terminationDate!: string;

  @IsEnum(TerminationReason)
  reason!: TerminationReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
