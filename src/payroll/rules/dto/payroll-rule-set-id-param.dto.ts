import { IsString, Matches } from 'class-validator';

export class PayrollRuleSetIdParamDto {
  @IsString()
  @Matches(/\S/)
  id!: string;
}
