import { IsInt, Max, Min } from 'class-validator';

export class CalculatePayrollDto {
  @IsInt()
  @Min(2024)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}