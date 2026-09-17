import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class DeductionCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let deductions = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'DEDUCTION') {
        continue;
      }

      const amount = toDecimal(novelty.amount ?? '0');

      deductions = deductions.plus(amount);

      concepts.push({
        code: 'DEDUCTION',
        name: novelty.description || 'Deducción',
        type: ConceptType.DEDUCTION,
        amount,
      });
    }

    return {
      deductions,
      concepts,
    };
  }
}