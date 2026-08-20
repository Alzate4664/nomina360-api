import { Injectable } from '@nestjs/common';
import { ConceptType, LeaveType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class LeaveCalculator {
  calculate(baseSalary: number, novelties: PayrollNovelty[]) {
    const dailySalary = baseSalary / 30;

    let earned = 0;
    let totalDays = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'LEAVE') {
        continue;
      }

      if (!novelty.leaveType) {
        continue;
      }

      const days = Number(novelty.quantity ?? 0);

      if (days <= 0) {
        continue;
      }

      totalDays += days;

      if (novelty.leaveType === LeaveType.UNPAID) {
        continue;
      }

      const amount = dailySalary * days;

      earned += amount;

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
