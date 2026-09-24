import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePayrollPeriodDto {
  @ApiPropertyOptional({
    description: 'Nombre descriptivo del período de nómina.',
    example: 'Nómina Agosto 2026',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Tipo de nómina a crear.',
    enum: PayrollType,
    example: PayrollType.MONTHLY,
  })
  @IsEnum(PayrollType)
  payrollType!: PayrollType;

  @ApiProperty({
    description:
      'Año de clasificación del período. Debe coincidir con startDate cuando exista.',
    example: 2026,
    minimum: 2000,
    maximum: 2100,
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({
    description:
      'Mes de clasificación del período. Debe coincidir con startDate cuando exista.',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional({
    description:
      'Fecha de inicio del período. Obligatoria para nóminas periódicas.',
    example: '2026-08-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'startDate debe tener formato YYYY-MM-DD.',
  })
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Fecha de finalización del período. Obligatoria para nóminas periódicas.',
    example: '2026-08-31',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'endDate debe tener formato YYYY-MM-DD.',
  })
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha programada de pago.',
    example: '2026-08-31',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  @Matches(DATE_ONLY_PATTERN, {
    message: 'paymentDate debe tener formato YYYY-MM-DD.',
  })
  paymentDate?: string;
}
