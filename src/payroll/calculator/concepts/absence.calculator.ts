import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class AbsenceCalculator {
  calculate(dailySalary: Decimal, novelties: PayrollNovelty[]) {
    let deductions = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'ABSENCE') {
        continue;
      }

      const days = toDecimal(novelty.quantity ?? '0');
      const amount = dailySalary.times(days);

      deductions = deductions.plus(amount);

      concepts.push({
        code: 'ABSENCE',
        name: novelty.description || 'Ausencia',
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
