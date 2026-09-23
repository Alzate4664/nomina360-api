import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PAYROLL_RATES } from '../config/payroll-rates.config';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

interface SeveranceCalculationInput {
  severanceBase: Decimal;
  accruedDays: number;
}

@Injectable()
export class SeveranceCalculator {
  calculate(input: SeveranceCalculationInput) {
    if (input.severanceBase.lte(0) || input.accruedDays <= 0) {
      return {
        severance: new Decimal(0),
        interest: new Decimal(0),
        total: new Decimal(0),
        concepts: [] as PayrollConceptAmount[],
      };
    }

    const severance = input.severanceBase
      .times(input.accruedDays)
      .dividedBy(PAYROLL_RATES.severance.daysPerYear);

    const interest = severance
      .times(PAYROLL_RATES.severance.interestAnnualRate)
      .times(input.accruedDays)
      .dividedBy(PAYROLL_RATES.severance.daysPerYear);

    const concepts: PayrollConceptAmount[] = [
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
      total: severance.plus(interest),
      concepts,
    };
  }
}
