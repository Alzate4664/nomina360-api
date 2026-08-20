import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class VacationCalculator {
  calculate(baseSalary: number, novelties: PayrollNovelty[]) {
    const dailySalary = baseSalary / 30;

    let earned = 0;
    let totalDays = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'VACATION') {
        continue;
      }

      const days = Number(novelty.quantity ?? 0);

      if (days <= 0) {
        continue;
      }

      const amount = dailySalary * days;

      earned += amount;
      totalDays += days;

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
