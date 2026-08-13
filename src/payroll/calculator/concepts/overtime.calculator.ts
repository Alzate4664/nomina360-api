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
      if (novelty.type !== 'OVERTIME' && novelty.type !== 'OVERTIME_NIGHT') {
        continue;
      }

      const hours = Number(novelty.quantity ?? 0);

      const overtimeMultiplier =
        novelty.type === 'OVERTIME_NIGHT'
          ? PAYROLL_RATES.overtime.nighttimeMultiplier
          : PAYROLL_RATES.overtime.daytimeMultiplier;

      const daySurchargeRate =
        novelty.dayType === 'SUNDAY' || novelty.dayType === 'HOLIDAY'
          ? PAYROLL_RATES.surcharges.sundayHolidayRate
          : 0;

      const multiplier = overtimeMultiplier + daySurchargeRate;

      const amount = hourlyRate * hours * multiplier;

      earned += amount;

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
