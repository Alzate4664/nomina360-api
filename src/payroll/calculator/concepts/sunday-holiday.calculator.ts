import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

@Injectable()
export class SundayHolidayCalculator {
  calculate(baseSalary: Decimal, novelties: PayrollNovelty[]) {
    const hourlyRate = baseSalary.dividedBy(
      PAYROLL_RATES.standardMonthlyHours,
    );

    let earned = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (
        novelty.type !== 'SUNDAY_SURCHARGE' &&
        novelty.type !== 'HOLIDAY_SURCHARGE'
      ) {
        continue;
      }

      const hours = toDecimal(novelty.quantity ?? '0');

      const amount = hourlyRate
        .times(hours)
        .times(toDecimal(PAYROLL_RATES.surcharges.sundayHolidayRate));

      earned = earned.plus(amount);

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