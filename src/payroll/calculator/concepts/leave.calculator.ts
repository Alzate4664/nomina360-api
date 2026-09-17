import { Injectable } from '@nestjs/common';
import { ConceptType, LeaveType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class LeaveCalculator {
  calculate(baseSalary: Decimal, novelties: PayrollNovelty[]) {
    const dailySalary = baseSalary.dividedBy(30);

    let earned = new Decimal(0);
    let totalDays = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'LEAVE') {
        continue;
      }

      if (!novelty.leaveType) {
        continue;
      }

      const days = toDecimal(novelty.quantity ?? '0');

      if (days.lte(0)) {
        continue;
      }

      totalDays = totalDays.plus(days);

      if (novelty.leaveType === LeaveType.UNPAID) {
        continue;
      }

      const amount = dailySalary.times(days);

      earned = earned.plus(amount);

      concepts.push({
        code: 'LEAVE',
        name: novelty.description || 'Licencia remunerada',
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