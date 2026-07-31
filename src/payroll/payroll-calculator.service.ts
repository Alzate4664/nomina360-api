import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class PayrollCalculatorService {
  calculate(input: {
    baseSalary: number;
    workedDays: number;
    novelties: PayrollNovelty[];
  }) {
    const dailySalary = input.baseSalary / 30;

    let earnedTotal = dailySalary * input.workedDays;
    let deductionsTotal = 0;

    const concepts: PayrollConcept[] = [];

    concepts.push({
      code: 'BASE_SALARY',
      name: 'Salario ordinario',
      type: ConceptType.EARNING,
      amount: earnedTotal,
    });

    for (const novelty of input.novelties) {
      if (novelty.type === 'BONUS') {
        const amount = Number(novelty.amount ?? 0);
        earnedTotal += amount;

        concepts.push({
          code: 'BONUS',
          name: novelty.description || 'Bonificación',
          type: ConceptType.EARNING,
          amount,
        });
      }

      if (novelty.type === 'DEDUCTION') {
        const amount = Number(novelty.amount ?? 0);
        deductionsTotal += amount;

        concepts.push({
          code: 'DEDUCTION',
          name: novelty.description || 'Deducción',
          type: ConceptType.DEDUCTION,
          amount,
        });
      }

      if (novelty.type === 'ABSENCE') {
        const days = Number(novelty.quantity ?? 0);
        const amount = dailySalary * days;
        deductionsTotal += amount;

        concepts.push({
          code: 'ABSENCE',
          name: novelty.description || 'Ausencia',
          type: ConceptType.DEDUCTION,
          amount,
        });
      }
    }

    const health = earnedTotal * 0.04;
    const pension = earnedTotal * 0.04;

    deductionsTotal += health + pension;

    concepts.push({
      code: 'HEALTH',
      name: 'Aporte salud empleado',
      type: ConceptType.DEDUCTION,
      amount: health,
    });

    concepts.push({
      code: 'PENSION',
      name: 'Aporte pensión empleado',
      type: ConceptType.DEDUCTION,
      amount: pension,
    });

    return {
      earnedTotal,
      deductionsTotal,
      netPay: earnedTotal - deductionsTotal,
      concepts,
    };
  }
}
