import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

interface NightSurchargeCalculationRules {
  standardMonthlyHours: Decimal;
  nighttimeRate: Decimal;
}

@Injectable()
export class NightSurchargeCalculator {
  calculate(
    baseSalary: Decimal,
    novelties: PayrollNovelty[],
    rules: NightSurchargeCalculationRules,
  ) {
    const hourlyRate = baseSalary.dividedBy(rules.standardMonthlyHours);

    let earned = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'NIGHT_SURCHARGE') {
        continue;
      }

      const hours = toDecimal(novelty.quantity ?? '0');

      const amount = hourlyRate.times(hours).times(rules.nighttimeRate);

      earned = earned.plus(amount);

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
