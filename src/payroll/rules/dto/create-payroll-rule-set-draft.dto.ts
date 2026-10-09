import {
  IsDefined,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreatePayrollRuleSetDraftDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  jurisdictionCode!: string;

  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsDefined()
  @IsObject()
  rulesPayload!: unknown;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  approvedEffectiveFrom!: string;

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsDefined()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  approvedEffectiveTo!: string | null;
}
