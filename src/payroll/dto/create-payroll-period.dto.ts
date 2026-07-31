import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PayrollType } from '@prisma/client';

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
    description: 'Año del período de nómina.',
    example: 2026,
    minimum: 2000,
    maximum: 2100,
  })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({
    description: 'Mes del período de nómina.',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiPropertyOptional({
    description: 'Fecha de inicio del período.',
    example: '2026-08-01',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha de finalización del período.',
    example: '2026-08-31',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha programada de pago.',
    example: '2026-08-30',
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}
