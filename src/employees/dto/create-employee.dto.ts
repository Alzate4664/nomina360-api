import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ContractType } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  documentType: string;

  @IsString()
  @IsNotEmpty()
  documentNumber: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  position: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsEnum(ContractType)
  contractType: ContractType;

  @IsOptional()
  @IsDateString()
  contractEndDate?: string;

  @IsNumber()
  @Min(0)
  baseSalary: number;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsString()
  eps?: string;

  @IsOptional()
  @IsString()
  pensionFund?: string;

  @IsOptional()
  @IsString()
  arl?: string;

  @IsOptional()
  @IsString()
  compensationBox?: string;
}
