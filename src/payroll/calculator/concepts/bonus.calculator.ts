import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class BonusCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let earned = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'BONUS') {
        continue;
      }

      const amount = toDecimal(novelty.amount ?? '0');

      earned = earned.plus(amount);

      concepts.push({
        code: 'BONUS',
        name: novelty.description || 'Bonificación',
        type: ConceptType.EARNING,
        amount,
      });
    }

    return {
      earned,
      concepts,
    };
  }
}
