import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

@Injectable()
export class OvertimeCalculator {
  calculate(baseSalary: Decimal, novelties: PayrollNovelty[]) {
    const hourlyRate = baseSalary.dividedBy(
      PAYROLL_RATES.standardMonthlyHours,
    );

    let earned = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'OVERTIME' && novelty.type !== 'OVERTIME_NIGHT') {
        continue;
      }

      const hours = toDecimal(novelty.quantity ?? '0');

      const overtimeMultiplier = toDecimal(
        novelty.type === 'OVERTIME_NIGHT'
          ? PAYROLL_RATES.overtime.nighttimeMultiplier
          : PAYROLL_RATES.overtime.daytimeMultiplier,
      );

      const daySurchargeRate =
        novelty.dayType === 'SUNDAY' || novelty.dayType === 'HOLIDAY'
          ? toDecimal(PAYROLL_RATES.surcharges.sundayHolidayRate)
          : new Decimal(0);

      const multiplier = overtimeMultiplier.plus(daySurchargeRate);

      const amount = hourlyRate.times(hours).times(multiplier);

      earned = earned.plus(amount);

      concepts.push({
        code: novelty.type,
        name:
          novelty.description ||
          (novelty.type === 'OVERTIME_NIGHT'
            ? 'Hora extra nocturna'
            : 'Hora extra diurna'),
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