import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty, SickLeaveOrigin } from '@prisma/client';
import Decimal from 'decimal.js';
import { toDecimal } from '../../money/decimal';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

interface SickLeaveCalculationRules {
  readonly monthlyIbcDayBasis: number;
  readonly commonDiseaseFirstRangeEndDay: number;
  readonly commonDiseaseFirstRate: Decimal;
  readonly commonDiseaseSecondRangeEndDay: number;
  readonly commonDiseaseSecondRate: Decimal;
  readonly workRiskRate: Decimal;
}

@Injectable()
export class SickLeaveCalculator {
  calculate(novelties: PayrollNovelty[], rules: SickLeaveCalculationRules) {
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

      const dailyIbc = sickLeaveIbc.dividedBy(rules.monthlyIbcDayBasis);

      let amount = new Decimal(0);

      if (novelty.sickLeaveOrigin === SickLeaveOrigin.COMMON_DISEASE) {
        amount = this.calculateCommonDisease(
          dailyIbc,
          novelty.sickLeaveStartDay,
          days,
          rules,
        );
      }

      if (
        novelty.sickLeaveOrigin === SickLeaveOrigin.WORK_ACCIDENT ||
        novelty.sickLeaveOrigin === SickLeaveOrigin.OCCUPATIONAL_DISEASE
      ) {
        amount = dailyIbc.times(days).times(rules.workRiskRate);
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
    rules: SickLeaveCalculationRules,
  ) {
    let amount = new Decimal(0);

    /*
     * La lógica actual de enfermedad común es diaria/discreta.
     * La conversión a number se limita al contador de días, no a dinero.
     */
    const dayCount = days.toNumber();

    for (let offset = 0; offset < dayCount; offset++) {
      const sickLeaveDay = startDay + offset;

      if (sickLeaveDay <= rules.commonDiseaseFirstRangeEndDay) {
        const dailyAmount = dailyIbc.times(rules.commonDiseaseFirstRate);
        amount = amount.plus(dailyAmount);
        continue;
      }

      if (sickLeaveDay <= rules.commonDiseaseSecondRangeEndDay) {
        const dailyAmount = dailyIbc.times(rules.commonDiseaseSecondRate);
        amount = amount.plus(dailyAmount);
      }
    }

    return amount;
  }
}
