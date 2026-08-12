import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class TransportAllowanceCalculator {
  calculate(baseSalary: number, workedDays: number) {
    const salaryLimit =
      PAYROLL_RATES.minimumWage *
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages;

    if (baseSalary > salaryLimit || workedDays <= 0) {
      return {
        earned: 0,
        concepts: [] as PayrollConcept[],
      };
    }

    const eligibleDays = Math.min(workedDays, 30);

    const amount = Math.round(
      (PAYROLL_RATES.transportAllowance.monthlyAmount / 30) * eligibleDays,
    );

    const concepts: PayrollConcept[] = [
      {
        code: 'TRANSPORT_ALLOWANCE',
        name: 'Auxilio de transporte',
        type: ConceptType.EARNING,
        amount,
      },
    ];

    return {
      earned: amount,
      concepts,
    };
  }
}
