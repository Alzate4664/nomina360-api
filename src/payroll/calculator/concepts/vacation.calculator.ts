import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class VacationCalculator {
  calculate(baseSalary: Decimal, novelties: PayrollNovelty[]) {
    const dailySalary = baseSalary.dividedBy(30);

    let earned = new Decimal(0);
    let totalDays = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'VACATION') {
        continue;
      }

      const days = toDecimal(novelty.quantity ?? '0');

      if (days.lte(0)) {
        continue;
      }

      const amount = dailySalary.times(days);

      earned = earned.plus(amount);
      totalDays = totalDays.plus(days);

      concepts.push({
        code: 'VACATION',
        name: novelty.description || 'Vacaciones',
        type: ConceptType.EARNING,
        amount,
      });
    }

    return {
      earned,
      days: totalDays,
      concepts,
    };
  }
}