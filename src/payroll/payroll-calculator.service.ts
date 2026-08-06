import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import { BaseSalaryCalculator } from './calculator/concepts/base-salary.calculator';
import { BonusCalculator } from './calculator/concepts/bonus.calculator';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class PayrollCalculatorService {
  constructor(
    private readonly baseSalaryCalculator: BaseSalaryCalculator,
    private readonly bonusCalculator: BonusCalculator,
  ) {}

  calculate(input: {
    baseSalary: number;
    workedDays: number;
    novelties: PayrollNovelty[];
  }) {
    const dailySalary = input.baseSalary / 30;

    const baseSalaryResult = this.baseSalaryCalculator.calculate(
      input.baseSalary,
      input.workedDays,
    );

    const bonusResult = this.bonusCalculator.calculate(input.novelties);

    let earnedTotal = baseSalaryResult.earned + bonusResult.earned;
    let deductionsTotal = 0;

    const concepts: PayrollConcept[] = [
      ...baseSalaryResult.concepts,
      ...bonusResult.concepts,
    ];

    for (const novelty of input.novelties) {
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
