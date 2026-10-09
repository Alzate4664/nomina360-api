import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

interface SeveranceCalculationRules {
  readonly daysPerYear: number;
  readonly interestAnnualRate: Decimal;
}

interface SeveranceCalculationInput {
  severanceBase: Decimal;
  accruedDays: number;
  rules: SeveranceCalculationRules;
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
      .dividedBy(input.rules.daysPerYear);

    const interest = severance
      .times(input.rules.interestAnnualRate)
      .times(input.accruedDays)
      .dividedBy(input.rules.daysPerYear);

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
