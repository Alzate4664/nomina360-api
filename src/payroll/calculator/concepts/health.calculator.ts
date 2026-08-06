import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class HealthCalculator {
  calculate(earnedTotal: number) {
    const amount = earnedTotal * 0.04;

    return {
      deductions: amount,

      concepts: [
        {
          code: 'HEALTH',
          name: 'Aporte salud empleado',
          type: ConceptType.DEDUCTION,
          amount,
        } satisfies PayrollConcept,
      ],
    };
  }
}
