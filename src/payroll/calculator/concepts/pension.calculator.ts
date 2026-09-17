import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class PensionCalculator {
  calculate(earnedTotal: Decimal) {
    const amount = earnedTotal.times('0.04');

    const concepts: PayrollConceptAmount[] = [
      {
        code: 'PENSION',
        name: 'Aporte pensión empleado',
        type: ConceptType.DEDUCTION,
        amount,
      },
    ];

    return {
      deductions: amount,
      concepts,
    };
  }
}