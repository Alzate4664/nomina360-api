import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class OvertimeCalculator {
  calculate(baseSalary: number, novelties: PayrollNovelty[]) {
    const hourlyRate = baseSalary / PAYROLL_RATES.standardMonthlyHours;

    let earned = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'OVERTIME') {
        continue;
      }

      const hours = Number(novelty.quantity ?? 0);

      const amount =
        hourlyRate * hours * PAYROLL_RATES.overtime.daytimeMultiplier;

      earned += amount;

      concepts.push({
        code: 'OVERTIME',
        name: novelty.description || 'Hora extra diurna',
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
