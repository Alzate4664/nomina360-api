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
export class NightSurchargeCalculator {
  calculate(baseSalary: number, novelties: PayrollNovelty[]) {
    const hourlyRate = baseSalary / PAYROLL_RATES.standardMonthlyHours;

    let earned = 0;

    const concepts: PayrollConcept[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'NIGHT_SURCHARGE') {
        continue;
      }

      const hours = Number(novelty.quantity ?? 0);

      const amount =
        hourlyRate * hours * PAYROLL_RATES.surcharges.nighttimeRate;

      earned += amount;

      concepts.push({
        code: 'NIGHT_SURCHARGE',
        name: novelty.description || 'Recargo nocturno',
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
