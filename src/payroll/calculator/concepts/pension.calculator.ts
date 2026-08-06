import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class PensionCalculator {
  calculate(earnedTotal: number) {
    const amount = earnedTotal * 0.04;

    return {
      deductions: amount,

      concepts: [
        {
          code: 'PENSION',
          name: 'Aporte pensión empleado',
          type: ConceptType.DEDUCTION,
          amount,
        } satisfies PayrollConcept,
      ],
    };
  }
}
