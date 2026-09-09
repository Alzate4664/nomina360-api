import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CalculateEmploymentTerminationDto {
  @ApiProperty({
    description:
      'Fecha desde la cual existe salario pendiente de pago. Debe ser igual o anterior a la fecha de terminación.',
    example: '2026-09-01',
  })
  @IsDateString()
  unpaidSalaryStartDate!: string;

  @ApiPropertyOptional({
    description:
      'Días de vacaciones pendientes que deben compensarse en la liquidación.',
    example: 7.5,
    minimum: 0,
    maximum: 360,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  pendingVacationDays?: number;
}
