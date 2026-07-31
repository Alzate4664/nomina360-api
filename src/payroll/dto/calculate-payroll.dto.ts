import { PayrollType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

export class CalculatePayrollDto {
  @ApiProperty({
    description: 'Año del período de nómina que se desea calcular.',
    example: 2026,
    minimum: 2024,
  })
  @IsInt()
  @Min(2024)
  year!: number;

  @ApiProperty({
    description: 'Mes del período de nómina que se desea calcular.',
    example: 8,
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({
    description: 'Tipo de nómina que se desea calcular.',
    enum: PayrollType,
    example: PayrollType.MONTHLY,
  })
  @IsEnum(PayrollType)
  payrollType!: PayrollType;
}
