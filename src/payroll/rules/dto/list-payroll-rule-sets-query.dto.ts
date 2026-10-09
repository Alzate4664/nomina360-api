import { PayrollRuleSetStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

function transformPagination(value: unknown): unknown {
  if (
    typeof value === 'string' &&
    /^[0-9]+$/.test(value) &&
    !/[^0-9]/.test(value)
  ) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  // Raw numbers are not HTTP digit strings and must fail IsInt as well.
  return typeof value === 'number' ? NaN : value;
}

export class ListPayrollRuleSetsQueryDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  jurisdictionCode?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsEnum(PayrollRuleSetStatus)
  status?: PayrollRuleSetStatus;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => transformPagination(value))
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => transformPagination(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
