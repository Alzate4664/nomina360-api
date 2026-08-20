import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

export interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

interface SeveranceCalculationInput {
  severanceBase: number;
  accruedDays: number;
}

@Injectable()
export class SeveranceCalculator {
  calculate(input: SeveranceCalculationInput) {
    if (input.severanceBase <= 0 || input.accruedDays <= 0) {
      return {
        severance: 0,
        interest: 0,
        total: 0,
        concepts: [] as PayrollConcept[],
      };
    }

    const severance =
      (input.severanceBase * input.accruedDays) /
      PAYROLL_RATES.severance.daysPerYear;

    const interest =
      (severance *
        PAYROLL_RATES.severance.interestAnnualRate *
        input.accruedDays) /
      PAYROLL_RATES.severance.daysPerYear;

    const concepts: PayrollConcept[] = [
      {
        code: 'SEVERANCE',
        name: 'Cesantías',
        type: ConceptType.EARNING,
        amount: severance,
      },
      {
        code: 'SEVERANCE_INTEREST',
        name: 'Intereses de cesantías',
        type: ConceptType.EARNING,
        amount: interest,
      },
    ];

    return {
      severance,
      interest,
      total: severance + interest,
      concepts,
    };
  }
}
