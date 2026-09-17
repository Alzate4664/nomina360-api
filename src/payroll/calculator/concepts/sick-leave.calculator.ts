import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty, SickLeaveOrigin } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class SickLeaveCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let earned = new Decimal(0);
    let totalDays = new Decimal(0);

    const concepts: PayrollConceptAmount[] = [];

    for (const novelty of novelties) {
      if (novelty.type !== 'SICK_LEAVE') {
        continue;
      }

      if (
        !novelty.sickLeaveOrigin ||
        !novelty.sickLeaveStartDay ||
        !novelty.sickLeaveIbc
      ) {
        continue;
      }

      const days = toDecimal(novelty.quantity ?? '0');
      const sickLeaveIbc = toDecimal(novelty.sickLeaveIbc);

      if (days.lte(0) || sickLeaveIbc.lte(0)) {
        continue;
      }

      totalDays = totalDays.plus(days);

      const dailyIbc = sickLeaveIbc.dividedBy(30);

      let amount = new Decimal(0);

      if (novelty.sickLeaveOrigin === SickLeaveOrigin.COMMON_DISEASE) {
        amount = this.calculateCommonDisease(
          dailyIbc,
          novelty.sickLeaveStartDay,
          days,
        );
      }

      if (
        novelty.sickLeaveOrigin === SickLeaveOrigin.WORK_ACCIDENT ||
        novelty.sickLeaveOrigin === SickLeaveOrigin.OCCUPATIONAL_DISEASE
      ) {
        amount = dailyIbc.times(days);
      }

      if (amount.lte(0)) {
        continue;
      }

      earned = earned.plus(amount);

      concepts.push({
        code: 'SICK_LEAVE',
        name: novelty.description || 'Incapacidad',
        type: ConceptType.EARNING,
        amount,
      });
    }

    return {
      earned,
      days: totalDays,
      concepts,
    };
  }

  private calculateCommonDisease(
    dailyIbc: Decimal,
    startDay: number,
    days: Decimal,
  ) {
    let amount = new Decimal(0);

    /*
     * La lógica actual de enfermedad común es diaria/discreta.
     * La conversión a number se limita al contador de días, no a dinero.
     */
    const dayCount = days.toNumber();

    for (let offset = 0; offset < dayCount; offset++) {
      const sickLeaveDay = startDay + offset;

      if (sickLeaveDay <= 90) {
        const dailyAmount = dailyIbc.times(2).dividedBy(3);
        amount = amount.plus(dailyAmount);
        continue;
      }

      if (sickLeaveDay <= 180) {
        const dailyAmount = dailyIbc.times('0.5');
        amount = amount.plus(dailyAmount);
      }
    }

    return amount;
  }
}