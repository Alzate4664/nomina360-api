import { TerminationReason } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEmploymentTerminationDto {
  @IsString()
  employeeId!: string;

  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'terminationDate debe tener formato YYYY-MM-DD',
  })
  terminationDate!: string;

  @IsEnum(TerminationReason)
  reason!: TerminationReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
