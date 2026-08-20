import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

export interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class ServiceBonusCalculator {
  calculate(baseSalary: number, accruedDays: number, transportAllowance = 0) {
    if (accruedDays <= 0) {
      return {
        earned: 0,
        concepts: [] as PayrollConcept[],
      };
    }

    const calculationBase = baseSalary + transportAllowance;

    const amount =
      (calculationBase * accruedDays) / PAYROLL_RATES.serviceBonus.daysPerYear;

    return {
      earned: amount,
      concepts: [
        {
          code: 'SERVICE_BONUS',
          name: 'Prima de servicios',
          type: ConceptType.EARNING,
          amount,
        },
      ] as PayrollConcept[],
    };
  }
}
