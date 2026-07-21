import { PayrollStatus, PayrollType } from '@prisma/client';

export class PayrollPeriodResponseDto {
  id!: string;
  companyId!: string;
  name!: string | null;
  payrollType!: PayrollType;
  year!: number;
  month!: number;
  status!: PayrollStatus;
  startDate!: Date | null;
  endDate!: Date | null;
  paymentDate!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
