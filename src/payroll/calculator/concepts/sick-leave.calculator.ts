import { Injectable } from '@nestjs/common';
import { ConceptType, PayrollNovelty, SickLeaveOrigin } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class SickLeaveCalculator {
  calculate(novelties: PayrollNovelty[]) {
    let earned = 0;
    let totalDays = 0;

    const concepts: PayrollConcept[] = [];

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

      const days = Number(novelty.quantity ?? 0);
      const sickLeaveIbc = Number(novelty.sickLeaveIbc);

      if (days <= 0 || sickLeaveIbc <= 0) {
        continue;
      }

      totalDays += days;

      const dailyIbc = sickLeaveIbc / 30;

      let amount = 0;

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
        amount = dailyIbc * days;
      }

      if (amount <= 0) {
        continue;
      }

      earned += amount;

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
    dailyIbc: number,
    startDay: number,
    days: number,
  ) {
    let amount = 0;

    for (let offset = 0; offset < days; offset++) {
      const sickLeaveDay = startDay + offset;

      if (sickLeaveDay <= 90) {
        amount += dailyIbc * (2 / 3);
        continue;
      }

      if (sickLeaveDay <= 180) {
        amount += dailyIbc * 0.5;
      }
    }

    return amount;
  }
}
