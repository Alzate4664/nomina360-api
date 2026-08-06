import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class DeductionCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let deductions = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'DEDUCTION') {
        continue;
      }

      const amount = Number(novelty.amount ?? 0);

      deductions += amount;

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
