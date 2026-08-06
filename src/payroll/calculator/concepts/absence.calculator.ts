import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class AbsenceCalculator {
  calculate(dailySalary: number, novelties: PayrollNovelty[]) {
    let deductions = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'ABSENCE') {
        continue;
      }

      const days = Number(novelty.quantity ?? 0);
      const amount = dailySalary * days;

      deductions += amount;

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
