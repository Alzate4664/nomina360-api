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
export class SundayHolidayCalculator {
  calculate(baseSalary: number, novelties: PayrollNovelty[]) {
    const hourlyRate = baseSalary / PAYROLL_RATES.standardMonthlyHours;

    let earned = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (
        novelty.type !== 'SUNDAY_SURCHARGE' &&
        novelty.type !== 'HOLIDAY_SURCHARGE'
      ) {
        continue;
      }

      const hours = Number(novelty.quantity ?? 0);

      const amount =
        hourlyRate * hours * PAYROLL_RATES.surcharges.sundayHolidayRate;

      earned += amount;

      concepts.push({
        code: novelty.type,
        name:
          novelty.description ||
          (novelty.type === 'SUNDAY_SURCHARGE'
            ? 'Recargo dominical'
            : 'Recargo festivo'),
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
