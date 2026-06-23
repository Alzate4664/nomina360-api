import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsIn(['OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER'])
  role?: 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'VIEWER';

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}