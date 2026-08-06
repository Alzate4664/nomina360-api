import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class BonusCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let earned = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'BONUS') {
        continue;
      }

      const amount = Number(novelty.amount ?? 0);

      earned += amount;

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
